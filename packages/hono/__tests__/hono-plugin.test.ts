import {
  InvalidDecoratorUsageError,
  transformInMemory,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import createHonoPlugin from '../src/plugin.js';

const honoPlugin = createHonoPlugin();

function createProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return transformInMemory(project, outputPath, [honoPlugin]);
}

describe('Hono Plugin Codegen', () => {
  it('generates createRouter and startServer when @Controller classes exist', () => {
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
    expect(result.code).toContain('export async function startServer');
    expect(result.code).toContain('ctx.get(EmbeddedServer).listen(router');
    expect(result.code).toContain(
      'export type AppType = ReturnType<typeof createRouter>',
    );
    expect(result.code).toContain(
      'export function createClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    expect(result.code).toContain('hc<AppType>(baseUrl, options)');
  });

  it('imports Hono, hc, EmbeddedServer, and HTTP_FILTER', () => {
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
    expect(result.code).toContain(
      "import { EmbeddedServer, HTTP_FILTER } from '@goodie-ts/hono'",
    );
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

    // Routes use relative paths in sub-app, basePath in .route()
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

  it('does not generate createRouter or startServer when no controllers exist', () => {
    const result = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {}
      `,
    });

    expect(result.code).not.toContain('EmbeddedServer');
    expect(result.code).not.toContain('startServer');
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

  it('generates Response passthrough in route handlers', () => {
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
      'if (result instanceof Response) return result',
    );
    expect(result.code).toContain('return c.json(result)');
  });

  it('generates void/null guard for route handlers', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Post } from './decorators.js'
        @Controller('/')
        class Ctrl {
          @Post('/')
          action() {}
        }
      `,
    });

    expect(result.code).toContain(
      'if (result === undefined || result === null) return c.body(null, 204)',
    );
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

  it('emits zValidator middleware for @Validate routes', () => {
    const result = createProject({
      '/src/schema.ts': `
        export const createTodoSchema = {}
      `,
      '/src/TodoController.ts': `
        import { Controller, Post, Get, Validate } from './decorators.js'
        import { createTodoSchema } from './schema.js'

        @Controller('/todos')
        class TodoController {
          @Post('/')
          @Validate({ json: createTodoSchema })
          create() {}

          @Get('/')
          list() {}
        }
      `,
    });

    expect(result.code).toContain(
      "import { zValidator } from '@hono/zod-validator'",
    );
    expect(result.code).toContain("zValidator('json', createTodoSchema");
    expect(result.code).toContain('Validation failed');

    // Schema import should use a relative path, not an absolute one
    expect(result.code).toMatch(
      /import \{ createTodoSchema \} from '\.\.\/src\/schema\.js'/,
    );
  });

  it('throws InvalidDecoratorUsageError for expression-based @Validate values', () => {
    expect(() =>
      createProject({
        '/src/Ctrl.ts': `
          import { Controller, Post, Validate } from './decorators.js'

          @Controller('/api')
          class Ctrl {
            @Post('/')
            @Validate({ json: makeSchema() })
            create() {}
          }
        `,
      }),
    ).toThrow(InvalidDecoratorUsageError);
  });
});

describe('Hono Plugin — @Cors', () => {
  it('emits cors() import when @Cors is used', () => {
    const result = createProject({
      '/src/ApiController.ts': `
        import { Controller, Get, Cors } from './decorators.js'

        @Cors()
        @Controller('/api')
        class ApiController {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain("import { cors } from 'hono/cors'");
  });

  it('emits cors() middleware for class-level @Cors() with no args', () => {
    const result = createProject({
      '/src/ApiController.ts': `
        import { Controller, Get, Cors } from './decorators.js'

        @Cors()
        @Controller('/api')
        class ApiController {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain('cors(),');
  });

  it('emits cors(config) for class-level @Cors with options', () => {
    const result = createProject({
      '/src/ApiController.ts': `
        import { Controller, Get, Cors } from './decorators.js'

        @Cors({ origin: 'https://example.com', allowMethods: ['GET', 'POST'] })
        @Controller('/api')
        class ApiController {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain("cors({ origin: 'https://example.com'");
    expect(result.code).toContain("allowMethods: ['GET', 'POST']");
  });

  it('applies class-level @Cors to all routes', () => {
    const result = createProject({
      '/src/ApiController.ts': `
        import { Controller, Get, Post, Cors } from './decorators.js'

        @Cors({ origin: '*' })
        @Controller('/api')
        class ApiController {
          @Get('/a')
          a() {}
          @Post('/b')
          b() {}
        }
      `,
    });

    // Both routes should have cors middleware
    const corsMatches = result.code.match(/cors\(\{ origin: '\*' \}\)/g);
    expect(corsMatches).toHaveLength(2);
  });

  it('method-level @Cors overrides class-level', () => {
    const result = createProject({
      '/src/ApiController.ts': `
        import { Controller, Get, Cors } from './decorators.js'

        @Cors({ origin: 'https://example.com' })
        @Controller('/api')
        class ApiController {
          @Get('/default')
          defaultCors() {}

          @Cors({ origin: '*' })
          @Get('/public')
          publicCors() {}
        }
      `,
    });

    // /api/default should use class-level cors
    expect(result.code).toContain("cors({ origin: 'https://example.com' })");
    // /api/public should use method-level cors (origin: '*')
    expect(result.code).toContain("cors({ origin: '*' })");
  });

  it('does not emit cors for routes without @Cors', () => {
    const result = createProject({
      '/src/ApiController.ts': `
        import { Controller, Get } from './decorators.js'

        @Controller('/api')
        class ApiController {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).not.toContain('cors');
    expect(result.code).not.toContain('hono/cors');
  });

  it('method-level @Cors without class-level only affects that route', () => {
    const result = createProject({
      '/src/ApiController.ts': `
        import { Controller, Get, Cors } from './decorators.js'

        @Controller('/api')
        class ApiController {
          @Cors({ origin: '*' })
          @Get('/public')
          publicRoute() {}

          @Get('/private')
          privateRoute() {}
        }
      `,
    });

    // Only the /public route should have cors
    const corsMatches = result.code.match(/cors\(/g);
    expect(corsMatches).toHaveLength(1);
  });

  it('cors middleware appears before validation middleware', () => {
    const result = createProject({
      '/src/schema.ts': `
        export const bodySchema = {}
      `,
      '/src/ApiController.ts': `
        import { Controller, Post, Cors, Validate } from './decorators.js'
        import { bodySchema } from './schema.js'

        @Cors({ origin: '*' })
        @Controller('/api')
        class ApiController {
          @Post('/data')
          @Validate({ json: bodySchema })
          create() {}
        }
      `,
    });

    const corsIdx = result.code.indexOf('cors(');
    const validatorIdx = result.code.indexOf('zValidator(');
    expect(corsIdx).toBeLessThan(validatorIdx);
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

    // Per-controller route factory function
    expect(result.code).toContain('function __createCtrlRoutes(ctrl: Ctrl)');
    expect(result.code).toContain(".get('/items'");
    expect(result.code).toContain(".post('/items'");
    // Per-controller type and client
    expect(result.code).toContain(
      'export type CtrlRoutes = ReturnType<typeof __createCtrlRoutes>',
    );
    expect(result.code).toContain(
      'export function createCtrlClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    // Top-level composition via .route()
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

    // Per-controller route types
    expect(result.code).toContain('export type UserControllerRoutes =');
    expect(result.code).toContain('export type TodoControllerRoutes =');
    // Per-controller client factories
    expect(result.code).toContain(
      'export function createUserControllerClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    expect(result.code).toContain(
      'export function createTodoControllerClient(baseUrl: string, options?: Parameters<typeof hc>[1])',
    );
    // Still has the full AppType and createClient
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

    // No `: Hono` return type — TypeScript must infer the chained type
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
