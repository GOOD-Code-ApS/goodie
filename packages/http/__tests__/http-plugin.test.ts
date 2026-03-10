import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import createHttpPlugin from '../src/plugin.js';

const httpPlugin = createHttpPlugin();

function createProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return transformInMemory(project, outputPath, [httpPlugin]);
}

describe('HTTP Plugin', () => {
  it('registers @Controller as singleton bean', () => {
    const result = createProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/users')
        class UserController {
          @Get('/')
          list() {}
        }
      `,
    });

    const bean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    expect(bean).toBeDefined();
    expect(bean!.scope).toBe('singleton');
  });

  it('stores httpController metadata with basePath', () => {
    const result = createProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/users')
        class UserController {
          @Get('/')
          list() {}
        }
      `,
    });

    const bean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    const httpController = bean!.metadata.httpController as {
      basePath: string;
      routes: Array<{ methodName: string; httpMethod: string; path: string }>;
    };
    expect(httpController).toBeDefined();
    expect(httpController.basePath).toBe('/api/users');
  });

  it('scans route methods and stores route metadata', () => {
    const result = createProject({
      '/src/UserController.ts': `
        import { Controller, Get, Post, Put, Delete, Patch } from './decorators.js'
        @Controller('/api')
        class UserController {
          @Get('/list')
          list() {}
          @Post('/')
          create() {}
          @Put('/:id')
          update() {}
          @Delete('/:id')
          remove() {}
          @Patch('/:id')
          patch() {}
        }
      `,
    });

    const bean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    const httpController = bean!.metadata.httpController as {
      basePath: string;
      routes: Array<{ methodName: string; httpMethod: string; path: string }>;
    };

    expect(httpController.routes).toHaveLength(5);
    expect(httpController.routes[0]).toEqual({
      methodName: 'list',
      httpMethod: 'get',
      path: '/list',
      hasRequestParam: false,
    });
    expect(httpController.routes[1]).toEqual({
      methodName: 'create',
      httpMethod: 'post',
      path: '/',
      hasRequestParam: false,
    });
    expect(httpController.routes[2]).toEqual({
      methodName: 'update',
      httpMethod: 'put',
      path: '/:id',
      hasRequestParam: false,
    });
    expect(httpController.routes[3]).toEqual({
      methodName: 'remove',
      httpMethod: 'delete',
      path: '/:id',
      hasRequestParam: false,
    });
    expect(httpController.routes[4]).toEqual({
      methodName: 'patch',
      httpMethod: 'patch',
      path: '/:id',
      hasRequestParam: false,
    });
  });

  it('records @Secured on class level', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Secured } from './decorators.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Get('/')
          list() {}
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = bean!.metadata.httpController as {
      secured?: boolean;
    };
    expect(httpController.secured).toBe(true);
  });

  it('records @Secured and @Anonymous on method level', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Post, Secured, Anonymous } from './decorators.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Get('/')
          list() {}
          @Post('/public')
          @Anonymous()
          publicRoute() {}
          @Post('/admin')
          @Secured()
          adminRoute() {}
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = bean!.metadata.httpController as {
      routes: Array<{
        methodName: string;
        secured?: boolean;
        anonymous?: boolean;
      }>;
    };

    const listRoute = httpController.routes.find(
      (r) => r.methodName === 'list',
    );
    expect(listRoute!.secured).toBeUndefined();
    expect(listRoute!.anonymous).toBeUndefined();

    const publicRoute = httpController.routes.find(
      (r) => r.methodName === 'publicRoute',
    );
    expect(publicRoute!.anonymous).toBe(true);

    const adminRoute = httpController.routes.find(
      (r) => r.methodName === 'adminRoute',
    );
    expect(adminRoute!.secured).toBe(true);
  });

  it('does not store metadata for non-controller classes', () => {
    const result = createProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class Service {}
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
    );
    expect(bean!.metadata.httpController).toBeUndefined();
  });

  it('defaults basePath to / when no argument', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller()
        class Ctrl {
          @Get('/')
          list() {}
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = bean!.metadata.httpController as {
      basePath: string;
    };
    expect(httpController.basePath).toBe('/');
  });

  it('detects Request parameter and sets hasRequestParam', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Post } from './decorators.js'
        class Request<T = unknown> {
          body: T;
          headers: any;
          query: any;
          params: Record<string, string>;
        }
        @Controller('/api')
        class Ctrl {
          @Get('/')
          list() {}
          @Get('/:id')
          getById(req: Request) {}
          @Post('/')
          create(req: Request<{ title: string }>) {}
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = bean!.metadata.httpController as {
      routes: Array<{ methodName: string; hasRequestParam: boolean }>;
    };

    expect(httpController.routes[0]).toMatchObject({
      methodName: 'list',
      hasRequestParam: false,
    });
    expect(httpController.routes[1]).toMatchObject({
      methodName: 'getById',
      hasRequestParam: true,
    });
    expect(httpController.routes[2]).toMatchObject({
      methodName: 'create',
      hasRequestParam: true,
    });
  });

  it('throws compile-time error for non-Request parameter types', () => {
    expect(() =>
      createProject({
        '/src/Ctrl.ts': `
          import { Controller, Get } from './decorators.js'
          interface Context { req: any }
          @Controller('/api')
          class Ctrl {
            @Get('/')
            list(c: Context) {}
          }
        `,
      }),
    ).toThrow(/must use Request<T> from @goodie-ts\/http.*Found: Context/);
  });

  it('throws compile-time error for primitive parameter types', () => {
    expect(() =>
      createProject({
        '/src/Ctrl.ts': `
          import { Controller, Get } from './decorators.js'
          @Controller('/api')
          class Ctrl {
            @Get('/:id')
            getById(id: string) {}
          }
        `,
      }),
    ).toThrow(/must use Request<T> from @goodie-ts\/http.*Found: string/);
  });

  it('defaults route path to / when no argument', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get()
          list() {}
        }
      `,
    });

    const bean = result.beans.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = bean!.metadata.httpController as {
      routes: Array<{ path: string }>;
    };
    expect(httpController.routes[0].path).toBe('/');
  });
});
