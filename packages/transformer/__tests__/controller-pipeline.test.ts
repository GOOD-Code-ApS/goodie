import { describe, expect, it } from 'vitest';
import { createTestProject } from './helpers.js';

describe('Controller Pipeline (Integration)', () => {
  it('should register @Controller as singleton bean with controller metadata', () => {
    const result = createTestProject({
      '/src/UserController.ts': `
        import { Controller, Get, Post } from './decorators.js'

        @Controller('/users')
        export class UserController {
          @Get('/')
          getAll() {}

          @Post('/')
          create() {}
        }
      `,
    });

    expect(result.beans).toHaveLength(1);
    const bean = result.beans[0];
    expect(bean.tokenRef).toMatchObject({
      kind: 'class',
      className: 'UserController',
    });
    expect(bean.scope).toBe('singleton');

    // Controller metadata should be stored on the bean
    expect(bean.metadata.controller).toEqual({
      basePath: '/users',
      routes: [
        { methodName: 'getAll', httpMethod: 'get', path: '/' },
        { methodName: 'create', httpMethod: 'post', path: '/' },
      ],
    });
  });

  it('should handle @Controller with constructor deps', () => {
    const result = createTestProject({
      '/src/UserService.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class UserService {}
      `,
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        import { UserService } from './UserService.js'

        @Controller('/users')
        export class UserController {
          constructor(private userService: UserService) {}

          @Get('/')
          getAll() {}
        }
      `,
    });

    expect(result.beans).toHaveLength(2);

    // UserService should come before UserController in topo order
    const names = result.beans.map((b) =>
      b.tokenRef.kind === 'class' ? b.tokenRef.className : b.tokenRef.tokenName,
    );
    expect(names.indexOf('UserService')).toBeLessThan(
      names.indexOf('UserController'),
    );

    const ctrlBean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    expect(ctrlBean?.metadata.controller).toEqual({
      basePath: '/users',
      routes: [{ methodName: 'getAll', httpMethod: 'get', path: '/' }],
    });
  });

  it('should handle multiple controllers with different base paths', () => {
    const result = createTestProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'

        @Controller('/users')
        export class UserController {
          @Get('/')
          list() {}
        }
      `,
      '/src/TodoController.ts': `
        import { Controller, Get, Post } from './decorators.js'

        @Controller('/todos')
        export class TodoController {
          @Get('/')
          list() {}

          @Post('/')
          create() {}
        }
      `,
    });

    expect(result.beans).toHaveLength(2);

    const userCtrl = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    const todoCtrl = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'TodoController',
    );
    expect(userCtrl?.metadata.controller).toEqual({
      basePath: '/users',
      routes: [{ methodName: 'list', httpMethod: 'get', path: '/' }],
    });
    expect(todoCtrl?.metadata.controller).toEqual({
      basePath: '/todos',
      routes: [
        { methodName: 'list', httpMethod: 'get', path: '/' },
        { methodName: 'create', httpMethod: 'post', path: '/' },
      ],
    });
  });

  it('should mix controllers and regular singletons', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        import { Service } from './Service.js'

        @Controller('/users')
        export class UserController {
          constructor(private service: Service) {}

          @Get('/')
          getAll() {}
        }
      `,
    });

    expect(result.beans).toHaveLength(2);

    const serviceBean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
    );
    const ctrlBean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    expect(serviceBean?.metadata.controller).toBeUndefined();
    expect(ctrlBean?.metadata.controller).toBeDefined();
  });

  it('should not add controller metadata to non-controller beans', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
    });

    expect(result.beans).toHaveLength(1);
    expect(result.beans[0].metadata.controller).toBeUndefined();
  });

  it('should include @Validate metadata on routes', () => {
    const result = createTestProject({
      '/src/schema.ts': `
        export const createTodoSchema = {}
      `,
      '/src/TodoController.ts': `
        import { Controller, Post, Get, Validate } from './decorators.js'
        import { createTodoSchema } from './schema.js'

        @Controller('/todos')
        export class TodoController {
          @Post('/')
          @Validate({ json: createTodoSchema })
          create() {}

          @Get('/')
          list() {}
        }
      `,
    });

    const ctrlBean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'TodoController',
    );
    const routes = (ctrlBean?.metadata.controller as any)?.routes;
    expect(routes).toHaveLength(2);

    const createRoute = routes.find((r: any) => r.methodName === 'create');
    expect(createRoute.validation).toBeDefined();
    expect(createRoute.validation[0].target).toBe('json');
    expect(createRoute.validation[0].schemaRef).toBe('createTodoSchema');

    const listRoute = routes.find((r: any) => r.methodName === 'list');
    expect(listRoute.validation).toBeUndefined();
  });

  it('should store all HTTP methods in controller metadata', () => {
    const result = createTestProject({
      '/src/ApiController.ts': `
        import { Controller, Get, Post, Put, Delete, Patch } from './decorators.js'

        @Controller('/api')
        export class ApiController {
          @Get('/items')
          list() {}

          @Post('/items')
          create() {}

          @Put('/items/:id')
          replace() {}

          @Patch('/items/:id')
          update() {}

          @Delete('/items/:id')
          remove() {}
        }
      `,
    });

    const ctrlBean = result.beans[0];
    const routes = (ctrlBean.metadata.controller as any).routes;
    expect(routes).toEqual([
      { methodName: 'list', httpMethod: 'get', path: '/items' },
      { methodName: 'create', httpMethod: 'post', path: '/items' },
      { methodName: 'replace', httpMethod: 'put', path: '/items/:id' },
      { methodName: 'update', httpMethod: 'patch', path: '/items/:id' },
      { methodName: 'remove', httpMethod: 'delete', path: '/items/:id' },
    ]);
  });
});
