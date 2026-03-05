import { describe, expect, it } from 'vitest';
import { createTestProject } from './helpers.js';

describe('Controller Pipeline (Integration)', () => {
  it('should generate EmbeddedServer bean for @Controller + @Get', () => {
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

    // Controller should appear as a singleton bean
    expect(result.beans).toHaveLength(1);
    const bean = result.beans[0];
    expect(bean.tokenRef).toMatchObject({
      kind: 'class',
      className: 'UserController',
    });
    expect(bean.scope).toBe('singleton');

    // Code should contain bean definition
    expect(result.code).toContain('token: UserController');
    expect(result.code).toContain("scope: 'singleton'");

    // Code should contain EmbeddedServer bean with route wiring
    expect(result.code).toContain('token: EmbeddedServer,');
    expect(result.code).toContain("import { Hono } from 'hono'");
    expect(result.code).toContain("__honoApp.get('/users'");
    expect(result.code).toContain("__honoApp.post('/users'");
    expect(result.code).toContain('userController.getAll(c)');
    expect(result.code).toContain('userController.create(c)');
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

    // Both beans should be generated
    expect(result.beans).toHaveLength(2);

    // UserService should come before UserController in topo order
    const names = result.beans.map((b) =>
      b.tokenRef.kind === 'class' ? b.tokenRef.className : b.tokenRef.tokenName,
    );
    expect(names.indexOf('UserService')).toBeLessThan(
      names.indexOf('UserController'),
    );

    // EmbeddedServer should be generated
    expect(result.code).toContain('token: EmbeddedServer,');
    expect(result.code).toContain("__honoApp.get('/users'");
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
    // Controllers are dependencies of the EmbeddedServer bean
    expect(result.code).toContain('token: UserController, optional: false');
    expect(result.code).toContain('token: TodoController, optional: false');
    expect(result.code).toContain("__honoApp.get('/users'");
    expect(result.code).toContain("__honoApp.get('/todos'");
    expect(result.code).toContain("__honoApp.post('/todos'");
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
    // Bean definitions for both
    expect(result.code).toContain('token: Service');
    expect(result.code).toContain('token: UserController');
    // EmbeddedServer for controller
    expect(result.code).toContain('token: EmbeddedServer,');
    expect(result.code).toContain("__honoApp.get('/users'");
  });

  it('should not generate EmbeddedServer when no controllers exist', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
    });

    expect(result.code).not.toContain('EmbeddedServer');
    expect(result.code).not.toContain('Hono');
  });

  it('should generate zValidator middleware for @Validate routes in full pipeline', () => {
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

    // zValidator should be imported and used
    expect(result.code).toContain(
      "import { zValidator } from '@hono/zod-validator'",
    );
    expect(result.code).toContain("zValidator('json', createTodoSchema");
    expect(result.code).toContain('Validation failed');
    // Schema should be imported
    expect(result.code).toContain('createTodoSchema');
    // Non-validated route should not have zValidator
    expect(result.code).toContain("__honoApp.get('/todos', async (c)");
  });

  it('should generate all HTTP methods correctly in full pipeline', () => {
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

    expect(result.code).toContain("__honoApp.get('/api/items'");
    expect(result.code).toContain("__honoApp.post('/api/items'");
    expect(result.code).toContain("__honoApp.put('/api/items/:id'");
    expect(result.code).toContain("__honoApp.patch('/api/items/:id'");
    expect(result.code).toContain("__honoApp.delete('/api/items/:id'");
  });
});
