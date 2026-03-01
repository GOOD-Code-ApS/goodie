import { describe, expect, it } from 'vitest';
import { createTestProject } from './helpers.js';

describe('Controller Pipeline (Integration)', () => {
  it('should generate both bean definitions and createRouter() for @Controller + @Get', () => {
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

    // Code should contain createRouter()
    expect(result.code).toContain('export function createRouter');
    expect(result.code).toContain("import { Hono } from 'hono'");
    expect(result.code).toContain("app.get('/users'");
    expect(result.code).toContain("app.post('/users'");
    expect(result.code).toContain('userController.getAll(c)');
    expect(result.code).toContain('userController.create(c)');
  });

  it('should handle @Controller with @Singleton and constructor deps', () => {
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

    // createRouter should be generated
    expect(result.code).toContain('export function createRouter');
    expect(result.code).toContain("app.get('/users'");
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
    expect(result.code).toContain(
      'const userController = ctx.get(UserController)',
    );
    expect(result.code).toContain(
      'const todoController = ctx.get(TodoController)',
    );
    expect(result.code).toContain("app.get('/users'");
    expect(result.code).toContain("app.get('/todos'");
    expect(result.code).toContain("app.post('/todos'");
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
    // createRouter for controller only
    expect(result.code).toContain('export function createRouter');
    expect(result.code).toContain("app.get('/users'");
  });

  it('should not generate createRouter() when no controllers exist', () => {
    const result = createTestProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'

        @Singleton()
        export class Service {}
      `,
    });

    expect(result.code).not.toContain('createRouter');
    expect(result.code).not.toContain('Hono');
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

    expect(result.code).toContain("app.get('/api/items'");
    expect(result.code).toContain("app.post('/api/items'");
    expect(result.code).toContain("app.put('/api/items/:id'");
    expect(result.code).toContain("app.patch('/api/items/:id'");
    expect(result.code).toContain("app.delete('/api/items/:id'");
  });
});
