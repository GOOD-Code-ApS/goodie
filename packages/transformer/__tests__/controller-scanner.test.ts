import { InvalidDecoratorUsageError, scan } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

function createProject(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('Controller Scanner', () => {
  describe('@Controller class detection', () => {
    it('should discover a @Controller class with routes', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Get(path?: string) { return (t: any, c: any) => {} }
          export function Post(path?: string) { return (t: any, c: any) => {} }
        `,
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

      const result = scan(project);

      expect(result.controllers).toHaveLength(1);
      expect(result.controllers[0].classTokenRef.className).toBe(
        'UserController',
      );
      expect(result.controllers[0].basePath).toBe('/users');
      expect(result.controllers[0].routes).toHaveLength(2);
    });

    it('should extract basePath from @Controller argument', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Get(path?: string) { return (t: any, c: any) => {} }
        `,
        '/src/TodoController.ts': `
          import { Controller, Get } from './decorators.js'

          @Controller('/api/todos')
          export class TodoController {
            @Get('/')
            list() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.controllers[0].basePath).toBe('/api/todos');
    });

    it('should default basePath to / when no argument', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Get(path?: string) { return (t: any, c: any) => {} }
        `,
        '/src/RootController.ts': `
          import { Controller, Get } from './decorators.js'

          @Controller()
          export class RootController {
            @Get('/')
            index() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.controllers[0].basePath).toBe('/');
    });

    it('should extract routes with correct httpMethod and path', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Get(path?: string) { return (t: any, c: any) => {} }
          export function Post(path?: string) { return (t: any, c: any) => {} }
          export function Put(path?: string) { return (t: any, c: any) => {} }
          export function Delete(path?: string) { return (t: any, c: any) => {} }
          export function Patch(path?: string) { return (t: any, c: any) => {} }
        `,
        '/src/CrudController.ts': `
          import { Controller, Get, Post, Put, Delete, Patch } from './decorators.js'

          @Controller('/items')
          export class CrudController {
            @Get('/')
            list() {}

            @Get('/:id')
            getById() {}

            @Post('/')
            create() {}

            @Put('/:id')
            replace() {}

            @Patch('/:id')
            update() {}

            @Delete('/:id')
            remove() {}
          }
        `,
      });

      const result = scan(project);
      const routes = result.controllers[0].routes;

      expect(routes).toHaveLength(6);
      expect(routes[0]).toMatchObject({
        methodName: 'list',
        httpMethod: 'get',
        path: '/',
      });
      expect(routes[1]).toMatchObject({
        methodName: 'getById',
        httpMethod: 'get',
        path: '/:id',
      });
      expect(routes[2]).toMatchObject({
        methodName: 'create',
        httpMethod: 'post',
        path: '/',
      });
      expect(routes[3]).toMatchObject({
        methodName: 'replace',
        httpMethod: 'put',
        path: '/:id',
      });
      expect(routes[4]).toMatchObject({
        methodName: 'update',
        httpMethod: 'patch',
        path: '/:id',
      });
      expect(routes[5]).toMatchObject({
        methodName: 'remove',
        httpMethod: 'delete',
        path: '/:id',
      });
    });

    it('should also register controller as a singleton bean', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Get(path?: string) { return (t: any, c: any) => {} }
        `,
        '/src/UserController.ts': `
          import { Controller, Get } from './decorators.js'

          @Controller('/users')
          export class UserController {
            @Get('/')
            getAll() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.beans).toHaveLength(1);
      expect(result.beans[0].classTokenRef.className).toBe('UserController');
      expect(result.beans[0].scope).toBe('singleton');
    });

    it('should not scan classes without @Controller as controllers', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Get(path?: string) { return (t: any, c: any) => {} }
        `,
        '/src/Service.ts': `
          import { Singleton } from './decorators.js'

          @Singleton()
          export class Service {}
        `,
        '/src/UserController.ts': `
          import { Controller, Get } from './decorators.js'

          @Controller('/users')
          export class UserController {
            @Get('/')
            getAll() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.controllers).toHaveLength(1);
      expect(result.controllers[0].classTokenRef.className).toBe(
        'UserController',
      );
      // Both should appear as beans
      expect(result.beans).toHaveLength(2);
    });

    it('should handle controller with constructor dependencies', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Singleton() { return (t: any, c: any) => {} }
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Get(path?: string) { return (t: any, c: any) => {} }
        `,
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

      const result = scan(project);

      const ctrlBean = result.beans.find(
        (b) => b.classTokenRef.className === 'UserController',
      )!;
      expect(ctrlBean.constructorParams).toHaveLength(1);
      expect(ctrlBean.constructorParams[0].typeName).toBe('UserService');
    });

    it('should throw when @Controller is combined with @Module', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Module(opts?: any) { return (t: any, c: any) => {} }
        `,
        '/src/Bad.ts': `
          import { Controller, Module } from './decorators.js'

          @Controller('/api')
          @Module()
          export class Bad {}
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
    });

    it('should throw when @Controller is combined with @Injectable', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Injectable() { return (t: any, c: any) => {} }
        `,
        '/src/Bad.ts': `
          import { Controller, Injectable } from './decorators.js'

          @Controller('/api')
          @Injectable()
          export class Bad {}
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
    });

    it('should throw when @Controller is combined with @Singleton', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Singleton() { return (t: any, c: any) => {} }
        `,
        '/src/Bad.ts': `
          import { Controller, Singleton } from './decorators.js'

          @Controller('/api')
          @Singleton()
          export class Bad {}
        `,
      });

      expect(() => scan(project)).toThrow(InvalidDecoratorUsageError);
    });

    it('should ignore methods without route decorators', () => {
      const project = createProject({
        '/src/decorators.ts': `
          export function Controller(path?: string) { return (t: any, c: any) => {} }
          export function Get(path?: string) { return (t: any, c: any) => {} }
        `,
        '/src/UserController.ts': `
          import { Controller, Get } from './decorators.js'

          @Controller('/users')
          export class UserController {
            @Get('/')
            getAll() {}

            helperMethod() {}
          }
        `,
      });

      const result = scan(project);

      expect(result.controllers[0].routes).toHaveLength(1);
      expect(result.controllers[0].routes[0].methodName).toBe('getAll');
    });
  });
});
