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
    expect(result.code).toContain(
      "import { EmbeddedServer } from '@goodie-ts/hono'",
    );
  });

  it('does not import security types when no @Secured is used', () => {
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

    expect(result.code).not.toContain('SecurityContext');
    expect(result.code).not.toContain('SECURITY_PROVIDER');
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

    expect(result.code).toContain("import { validator } from 'hono-openapi'");
    expect(result.code).toContain("validator('json', createTodoSchema");

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
    const validatorIdx = result.code.indexOf('validator(');
    expect(corsIdx).toBeLessThan(validatorIdx);
  });
});

describe('Hono Plugin — @Secured / @Anonymous', () => {
  it('imports security types when @Secured is used', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Secured } from './decorators.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).toContain(
      "import { SECURITY_PROVIDER } from '@goodie-ts/hono'",
    );
    expect(result.code).toContain(
      "import type { SecurityProvider } from '@goodie-ts/hono'",
    );
    expect(result.code).not.toContain('SecurityContext');
  });

  it('generates security middleware for @Secured controller routes', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Secured } from './decorators.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    // Should check for authentication
    expect(result.code).toContain('__securityProvider.authenticate');
    // Should return 401 on failure
    expect(result.code).toContain("c.json({ error: 'Unauthorized' }, 401)");
    // Should set principal on Hono context
    expect(result.code).toContain("c.set('principal', __principal)");
  });

  it('resolves SecurityProvider in createRouter', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Secured } from './decorators.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).not.toContain('ctx.get(SecurityContext)');
    expect(result.code).toContain('ctx.getAll(SECURITY_PROVIDER)');
  });

  it('passes security args to route factory for secured controllers', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Secured } from './decorators.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Get('/data')
          getData() {}
        }
      `,
    });

    expect(result.code).not.toContain('__securityContext');
    expect(result.code).toContain(
      '__securityProvider: SecurityProvider | undefined',
    );
  });

  it('does not pass security args to route factory for non-secured controllers', () => {
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

    expect(result.code).not.toContain('__securityContext');
    expect(result.code).not.toContain('__securityProvider');
  });

  it('@Anonymous skips auth enforcement in @Secured controller', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Secured, Anonymous } from './decorators.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Get('/data')
          getData() {}

          @Get('/health')
          @Anonymous()
          health() {}
        }
      `,
    });

    // Both secured and anonymous routes exist
    // The anonymous route should still authenticate and set principal but not reject
    // Count occurrences of authenticate to verify both routes handle auth
    const authMatches = result.code.match(/__securityProvider\.authenticate/g);
    expect(authMatches).toHaveLength(2);

    // The secured route rejects with 401 if no principal
    // The anonymous route does not reject
    const unauthorizedMatches = result.code.match(
      /if \(!__principal\) return c\.json/g,
    );
    // Only the secured route has the rejection
    expect(unauthorizedMatches).toHaveLength(1);
  });

  it('handles method-level @Secured without class-level', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Post, Secured } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/public')
          publicRoute() {}

          @Post('/admin')
          @Secured()
          adminRoute() {}
        }
      `,
    });

    // Should import security types
    expect(result.code).toContain('SECURITY_PROVIDER');
    // Only admin route should have security middleware
    const authMatches = result.code.match(/__securityProvider\.authenticate/g);
    expect(authMatches).toHaveLength(1);
  });

  it('mixes secured and non-secured controllers', () => {
    const result = createProject({
      '/src/PublicCtrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/public')
        class PublicCtrl {
          @Get('/') list() {}
        }
      `,
      '/src/AdminCtrl.ts': `
        import { Controller, Get, Secured } from './decorators.js'
        @Controller('/admin')
        @Secured()
        class AdminCtrl {
          @Get('/') list() {}
        }
      `,
    });

    // PublicCtrl factory should not have security params
    expect(result.code).toContain(
      'function __createPublicCtrlRoutes(publicCtrl: PublicCtrl)',
    );
    // AdminCtrl factory should have security params
    expect(result.code).toContain(
      '__createAdminCtrlRoutes(adminCtrl: AdminCtrl, __securityProvider: SecurityProvider',
    );
    // createRouter should pass security args only to AdminCtrl
    expect(result.code).toContain(
      '__createAdminCtrlRoutes(ctx.get(AdminCtrl), __securityProvider)',
    );
    // But not to PublicCtrl
    expect(result.code).toMatch(
      /__createPublicCtrlRoutes\(ctx\.get\(PublicCtrl\)\)/,
    );
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

describe('Hono Plugin — OpenAPI (describeRoute)', () => {
  it('generates describeRoute middleware when route has OpenAPI options', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/', { summary: 'List items', description: 'Returns all items' })
          list() {}
        }
      `,
    });

    expect(result.code).toContain(
      "import { describeRoute } from 'hono-openapi'",
    );
    expect(result.code).toContain(
      'describeRoute({ summary: "List items", description: "Returns all items" })',
    );
  });

  it('generates describeRoute with tags', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/', { tags: ['items', 'public'] })
          list() {}
        }
      `,
    });

    expect(result.code).toContain('tags: ["items","public"]');
  });

  it('generates describeRoute with deprecated flag', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/old', { deprecated: true })
          oldEndpoint() {}
        }
      `,
    });

    expect(result.code).toContain('deprecated: true');
  });

  it('passes responses raw to describeRoute and imports resolver + schemas', () => {
    const result = createProject({
      '/src/schema.ts': `
        export const itemSchema = {}
      `,
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        import { itemSchema } from './schema.js'
        @Controller('/api')
        class Ctrl {
          @Get('/', {
            responses: {
              200: { description: 'Success', content: { 'application/json': { schema: resolver(itemSchema) } } }
            }
          })
          list() {}
        }
      `,
    });

    expect(result.code).toContain('describeRoute({');
    expect(result.code).toContain('responses: {');
    expect(result.code).toContain("200: { description: 'Success'");
    expect(result.code).toContain('resolver(itemSchema)');
    // Should import resolver from hono-openapi
    expect(result.code).toContain("import { resolver } from 'hono-openapi'");
    // Should import the schema used inside resolver()
    expect(result.code).toContain('import { itemSchema }');
  });

  it('does not generate describeRoute when no route has OpenAPI options', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/')
          list() {}
        }
      `,
    });

    expect(result.code).not.toContain('describeRoute');
    expect(result.code).not.toContain('openAPIRouteHandler');
    expect(result.code).not.toContain('OpenApiConfig');
  });

  it('generates openAPIRouteHandler when any route has OpenAPI options', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/', { summary: 'List' })
          list() {}
        }
      `,
    });

    expect(result.code).toContain(
      "import { openAPIRouteHandler } from 'hono-openapi'",
    );
    expect(result.code).toContain(
      "import { OpenApiConfig } from '@goodie-ts/hono'",
    );
    expect(result.code).toContain('ctx.get(OpenApiConfig)');
    expect(result.code).toContain(
      'openAPIRouteHandler(__router, { documentation: { info: {',
    );
    expect(result.code).toContain('title: __openApiConfig.title');
    expect(result.code).toContain('version: __openApiConfig.version');
  });

  it('mounts openAPIRouteHandler on /openapi.json', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/', { summary: 'List' })
          list() {}
        }
      `,
    });

    expect(result.code).toContain("__router.get('/openapi.json'");
  });

  it('describeRoute appears before other middleware', () => {
    const result = createProject({
      '/src/schema.ts': `export const bodySchema = {}`,
      '/src/Ctrl.ts': `
        import { Controller, Post, Validate, Secured } from './decorators.js'
        import { bodySchema } from './schema.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Post('/', { summary: 'Create item' })
          @Validate({ json: bodySchema })
          create() {}
        }
      `,
    });

    const describeIdx = result.code.indexOf('describeRoute(');
    const securityIdx = result.code.indexOf('__securityProvider.authenticate');
    const validatorIdx = result.code.indexOf("validator('json'");
    expect(describeIdx).toBeLessThan(securityIdx);
    expect(securityIdx).toBeLessThan(validatorIdx);
  });

  it('only annotated routes get describeRoute, others do not', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/', { summary: 'List' })
          list() {}

          @Get('/health')
          health() {}
        }
      `,
    });

    // describeRoute should appear once (for list), not for health
    const matches = result.code.match(/describeRoute\(/g);
    expect(matches).toHaveLength(1);
  });
});
