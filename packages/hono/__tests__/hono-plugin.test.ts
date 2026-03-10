import createHttpPlugin from '@goodie-ts/http/plugin';
import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import createHonoPlugin from '../src/plugin.js';

const httpPlugin = createHttpPlugin();
const honoPlugin = createHonoPlugin();

function createProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
  plugins = [httpPlugin, honoPlugin],
  inlinedConfig?: Record<string, string>,
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return transformInMemory(
    project,
    outputPath,
    plugins,
    undefined,
    undefined,
    inlinedConfig ? { inlinedConfig } : undefined,
  );
}

describe('Hono Plugin Codegen', () => {
  it('generates createRouter and onStart hook when @Controller classes exist', () => {
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

    expect(result.code).toContain(
      'export function createRouter(ctx: ApplicationContext)',
    );
    expect(result.code).toContain('app.onStart(async (ctx) => {');
    expect(result.code).toContain('ctx.get(EmbeddedServer).listen(router');
    expect(result.code).not.toContain('export async function startServer');
    expect(result.code).toContain(
      'export type AppType = ReturnType<typeof createRouter>',
    );
    expect(result.code).toContain(
      'export function createClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    expect(result.code).toContain('hc<AppType>(baseUrl, options)');
  });

  it('imports Hono, hc, and EmbeddedServer', () => {
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

    expect(result.code).toContain("import { Hono } from 'hono'");
    expect(result.code).toContain("import { hc } from 'hono/client'");
    expect(result.code).toContain('EmbeddedServer');
    expect(result.code).toContain('handleResult');
    expect(result.code).toContain("from '@goodie-ts/hono'");
  });

  it('wires routes in createRouter', () => {
    const result = createProject({
      '/src/UserController.ts': `
        import { Controller, Get, Post } from './decorators.js'
        @Controller('/api/users')
        class UserController {
          @Get('/')
          list() {}
          @Post('/')
          create() {}
        }
      `,
    });

    expect(result.code).toContain(".route('/api/users'");
    expect(result.code).toContain(".get('/'");
    expect(result.code).toContain(".post('/'");
    expect(result.code).toContain('userController.list(c)');
    expect(result.code).toContain('userController.create(c)');
  });

  it('retrieves controllers from ApplicationContext in createRouter', () => {
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

    expect(result.code).toContain('ctx.get(UserController)');
  });

  it('does not generate createRouter or onStart hook when no controllers exist', () => {
    const result = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {}
      `,
    });

    expect(result.code).not.toContain('EmbeddedServer');
    expect(result.code).not.toContain('app.onStart');
    expect(result.code).not.toContain('Hono');
    expect(result.code).not.toContain('createRouter');
    expect(result.code).not.toContain('AppType');
    expect(result.code).not.toContain('createClient');
    expect(result.code).not.toContain('hc');
  });

  it('handles multiple controllers', () => {
    const result = createProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/users')
        class UserController {
          @Get('/')
          list() {}
        }
      `,
      '/src/TodoController.ts': `
        import { Controller, Get, Post } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          list() {}
          @Post('/')
          create() {}
        }
      `,
    });

    expect(result.code).toContain('export function createRouter');
    expect(result.code).toContain(".route('/api/users'");
    expect(result.code).toContain(".route('/api/todos'");
  });

  it('uses handleResult helper for route handlers', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain('handleResult(c, await ctrl.getData(c))');
  });

  it('handles all HTTP methods', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Post, Put, Delete, Patch } from './decorators.js'
        @Controller('/r')
        class Ctrl {
          @Get('/') a() {}
          @Post('/') b() {}
          @Put('/') c() {}
          @Delete('/') d() {}
          @Patch('/') e() {}
        }
      `,
    });

    expect(result.code).toContain(".route('/r'");
    expect(result.code).toContain(".get('/'");
    expect(result.code).toContain(".post('/'");
    expect(result.code).toContain(".put('/'");
    expect(result.code).toContain(".delete('/'");
    expect(result.code).toContain(".patch('/'");
  });

  it('uses collision-safe variable names for same-prefix controllers', () => {
    const result = createProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/v1/users')
        class UserController {
          @Get('/') list() {}
        }
      `,
      '/src/UserControllerV2.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/v2/users')
        class UserControllerV2 {
          @Get('/') list() {}
        }
      `,
    });

    expect(result.code).toContain('userController');
    expect(result.code).toContain('userControllerV2');
  });
});

describe('Hono Plugin — CORS from config', () => {
  it('always emits corsMiddleware in createRouter', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain('corsMiddleware');
    expect(result.code).toContain("__router.use('*', corsMiddleware(");
  });

  it('emits corsMiddleware() with no args when no server.cors config', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain('corsMiddleware()');
  });

  it('emits corsMiddleware with origin from config', () => {
    const result = createProject(
      {
        '/src/Ctrl.ts': `
          import { Controller, Get } from './decorators.js'
          @Controller('/api')
          class Ctrl {
            @Get('/data')
            getData() {}
          }
        `,
      },
      '/out/AppContext.generated.ts',
      [httpPlugin, honoPlugin],
      { 'server.cors.origin': 'https://example.com' },
    );

    expect(result.code).toContain(
      "corsMiddleware({ origin: 'https://example.com' })",
    );
  });

  it('emits corsMiddleware with multiple origins from config', () => {
    const result = createProject(
      {
        '/src/Ctrl.ts': `
          import { Controller, Get } from './decorators.js'
          @Controller('/api')
          class Ctrl {
            @Get('/data')
            getData() {}
          }
        `,
      },
      '/out/AppContext.generated.ts',
      [httpPlugin, honoPlugin],
      { 'server.cors.origin': 'https://a.com,https://b.com' },
    );

    expect(result.code).toContain(
      "corsMiddleware({ origin: ['https://a.com', 'https://b.com'] })",
    );
  });

  it('emits corsMiddleware with allowMethods and credentials from config', () => {
    const result = createProject(
      {
        '/src/Ctrl.ts': `
          import { Controller, Get } from './decorators.js'
          @Controller('/api')
          class Ctrl {
            @Get('/data')
            getData() {}
          }
        `,
      },
      '/out/AppContext.generated.ts',
      [httpPlugin, honoPlugin],
      {
        'server.cors.origin': '*',
        'server.cors.allowMethods': 'GET,POST,PUT',
        'server.cors.credentials': 'true',
      },
    );

    expect(result.code).toContain("origin: '*'");
    expect(result.code).toContain("allowMethods: ['GET', 'POST', 'PUT']");
    expect(result.code).toContain('credentials: true');
  });
});

describe('Hono Plugin — RPC Client', () => {
  it('exports AppType as ReturnType of createRouter', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain(
      'export type AppType = ReturnType<typeof createRouter>',
    );
  });

  it('generates createClient that wraps hc<AppType>', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain(
      'export function createClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    expect(result.code).toContain('return hc<AppType>(baseUrl, options)');
  });

  it('chains route registrations for type inference', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Post } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/items')
          list() {}
          @Post('/items')
          create() {}
        }
      `,
    });

    expect(result.code).toContain('function __createCtrlRoutes(ctrl: Ctrl)');
    expect(result.code).toContain(".get('/items'");
    expect(result.code).toContain(".post('/items'");
    expect(result.code).toContain(
      'export type CtrlRoutes = ReturnType<typeof __createCtrlRoutes>',
    );
    expect(result.code).toContain(
      'export function createCtrlClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    expect(result.code).toContain('return new Hono()');
    expect(result.code).toContain(".route('/api'");
  });

  it('generates per-controller route types and client factories', () => {
    const result = createProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/users')
        class UserController {
          @Get('/')
          list() {}
        }
      `,
      '/src/TodoController.ts': `
        import { Controller, Get, Post } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          list() {}
          @Post('/')
          create() {}
        }
      `,
    });

    expect(result.code).toContain('export type UserControllerRoutes =');
    expect(result.code).toContain('export type TodoControllerRoutes =');
    expect(result.code).toContain(
      'export function createUserControllerClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    expect(result.code).toContain(
      'export function createTodoControllerClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    expect(result.code).toContain('export type AppType =');
    expect(result.code).toContain(
      'export function createClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
  });

  it('createRouter has no explicit return type annotation', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).not.toContain(
      'createRouter(ctx: ApplicationContext): Hono',
    );
    expect(result.code).toContain('createRouter(ctx: ApplicationContext)');
  });

  it('handles root-path controller mounting', () => {
    const result = createProject({
      '/src/RootController.ts': `
        import { Controller, Get, Post } from './decorators.js'
        @Controller('/')
        class RootController {
          @Get('/health')
          health() {}
          @Post('/echo')
          echo() {}
        }
      `,
    });

    expect(result.code).toContain(
      'function __createRootControllerRoutes(rootController: RootController)',
    );
    expect(result.code).toContain(".route('/'");
    expect(result.code).toContain(".get('/health'");
    expect(result.code).toContain(".post('/echo'");
    expect(result.code).toContain('export type RootControllerRoutes =');
    expect(result.code).toContain(
      'export function createRootControllerClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
  });
});

describe('Multi-runtime codegen', () => {
  const controllerFile = `
    import { Controller, Get } from './decorators.js'
    @Controller('/api/users')
    class UserController {
      @Get('/')
      list() {}
    }
  `;

  it('generates onStart hook with EmbeddedServer for node runtime (default)', () => {
    const result = createProject({ '/src/UserController.ts': controllerFile });

    expect(result.code).toContain('app.onStart(async (ctx) => {');
    expect(result.code).toContain('ctx.get(EmbeddedServer).listen(router');
    expect(result.code).toContain('EmbeddedServer');
    expect(result.code).toContain("from '@goodie-ts/hono'");
    expect(result.code).not.toContain('RuntimeBindings');
    expect(result.code).not.toContain('export default');
  });

  it('skips onStart hook and EmbeddedServer for cloudflare runtime', () => {
    const result = createProject(
      { '/src/UserController.ts': controllerFile },
      '/out/AppContext.generated.ts',
      [httpPlugin, honoPlugin],
      { 'server.runtime': 'cloudflare' },
    );

    expect(result.code).not.toContain('app.onStart');
    expect(result.code).not.toContain('EmbeddedServer');
    expect(result.code).toContain(
      'export function createRouter(ctx: ApplicationContext)',
    );
    expect(result.code).toContain('export function createClient');
    expect(result.code).toContain(
      'export type AppType = ReturnType<typeof createRouter>',
    );
  });
});
