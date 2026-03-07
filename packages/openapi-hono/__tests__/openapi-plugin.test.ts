import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import createHonoPlugin from '../../hono/src/plugin.js';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import createOpenApiHonoPlugin from '../src/plugin.js';

const honoPlugin = createHonoPlugin();
const openApiPlugin = createOpenApiHonoPlugin();

function createProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return transformInMemory(project, outputPath, [honoPlugin, openApiPlugin]);
}

describe('OpenAPI Hono Plugin — Basic Codegen', () => {
  it('generates createOpenApiRouter when controllers exist', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          list() {}
        }
      `,
    });

    expect(result.code).toContain(
      'export function createOpenApiRouter(ctx: ApplicationContext)',
    );
    expect(result.code).toContain(
      "import { createRoute, OpenAPIHono } from '@hono/zod-openapi'",
    );
    expect(result.code).toContain(
      "import { OpenApiConfig } from '@goodie-ts/openapi-hono'",
    );
  });

  it('does not generate anything when no controllers exist', () => {
    const result = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {}
      `,
    });

    expect(result.code).not.toContain('createOpenApiRouter');
    expect(result.code).not.toContain('zod-openapi');
  });

  it('generates createRoute for each route method', () => {
    const result = createProject({
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

    expect(result.code).toContain('__todoController_list_route');
    expect(result.code).toContain('__todoController_create_route');
    expect(result.code).toContain("method: 'get'");
    expect(result.code).toContain("method: 'post'");
  });

  it('converts Hono paths to OpenAPI paths', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/:id')
          getById() {}
        }
      `,
    });

    expect(result.code).toContain("path: '/api/todos/{id}'");
  });

  it('joins base path and route path correctly', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/items')
          list() {}
        }
      `,
    });

    expect(result.code).toContain("path: '/api/items'");
  });
});

describe('OpenAPI Hono Plugin — All HTTP Methods', () => {
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

    expect(result.code).toContain("method: 'get'");
    expect(result.code).toContain("method: 'post'");
    expect(result.code).toContain("method: 'put'");
    expect(result.code).toContain("method: 'delete'");
    expect(result.code).toContain("method: 'patch'");
  });
});

describe('OpenAPI Hono Plugin — @Validate Schema Forwarding', () => {
  it('forwards Zod schemas from @Validate to createRoute request body', () => {
    const result = createProject({
      '/src/schema.ts': `
        export const createTodoSchema = {}
      `,
      '/src/TodoController.ts': `
        import { Controller, Post, Validate } from './decorators.js'
        import { createTodoSchema } from './schema.js'
        @Controller('/api/todos')
        class TodoController {
          @Post('/')
          @Validate({ json: createTodoSchema })
          create() {}
        }
      `,
    });

    expect(result.code).toContain(
      "body: { content: { 'application/json': { schema: createTodoSchema } } }",
    );
  });

  it('forwards query validation to createRoute', () => {
    const result = createProject({
      '/src/schema.ts': `
        export const querySchema = {}
      `,
      '/src/Ctrl.ts': `
        import { Controller, Get, Validate } from './decorators.js'
        import { querySchema } from './schema.js'
        @Controller('/api')
        class Ctrl {
          @Get('/search')
          @Validate({ query: querySchema })
          search() {}
        }
      `,
    });

    expect(result.code).toContain('query: querySchema');
  });

  it('forwards param validation to createRoute', () => {
    const result = createProject({
      '/src/schema.ts': `
        export const paramSchema = {}
      `,
      '/src/Ctrl.ts': `
        import { Controller, Get, Validate } from './decorators.js'
        import { paramSchema } from './schema.js'
        @Controller('/api')
        class Ctrl {
          @Get('/:id')
          @Validate({ param: paramSchema })
          getById() {}
        }
      `,
    });

    expect(result.code).toContain('params: paramSchema');
  });
});

describe('OpenAPI Hono Plugin — Auto-Inferred Responses', () => {
  it('infers 200 for GET routes', () => {
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

    expect(result.code).toContain("200: { description: 'Success' }");
  });

  it('infers 201 for POST routes', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Post } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Post('/data')
          create() {}
        }
      `,
    });

    expect(result.code).toContain("201: { description: 'Success' }");
  });

  it('infers 400 when @Validate is present', () => {
    const result = createProject({
      '/src/schema.ts': `export const bodySchema = {}`,
      '/src/Ctrl.ts': `
        import { Controller, Post, Validate } from './decorators.js'
        import { bodySchema } from './schema.js'
        @Controller('/api')
        class Ctrl {
          @Post('/')
          @Validate({ json: bodySchema })
          create() {}
        }
      `,
    });

    expect(result.code).toContain("400: { description: 'Validation failed' }");
  });

  it('infers 401 when @Secured is present', () => {
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

    expect(result.code).toContain("401: { description: 'Unauthorized' }");
  });

  it('infers 404 when path has parameters', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/:id')
          getById() {}
        }
      `,
    });

    expect(result.code).toContain("404: { description: 'Not found' }");
  });

  it('does not infer 401 for @Anonymous routes in @Secured controller', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Secured, Anonymous } from './decorators.js'
        @Controller('/api')
        @Secured()
        class Ctrl {
          @Get('/secured')
          secured() {}

          @Get('/public')
          @Anonymous()
          public_() {}
        }
      `,
    });

    // The secured route should have 401
    const securedRouteMatch = result.code.match(
      /__ctrl_secured_route = createRoute\(\{.*?\}\s*\}\s*\)/s,
    );
    expect(securedRouteMatch?.[0]).toContain('401');

    // The anonymous route should NOT have 401
    const publicRouteMatch = result.code.match(
      /__ctrl_public__route = createRoute\(\{.*?\}\s*\}\s*\)/s,
    );
    expect(publicRouteMatch?.[0]).not.toContain('401');
  });
});

describe('OpenAPI Hono Plugin — Security', () => {
  it('adds security requirement to secured routes', () => {
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

    expect(result.code).toContain('security: [{ bearer: [] }]');
  });

  it('imports SECURITY_PROVIDER when @Secured is used', () => {
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
  });

  it('does not import security types when no @Secured is used', () => {
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

    expect(result.code).not.toContain('SECURITY_PROVIDER');
  });

  it('generates security middleware for secured routes', () => {
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

    expect(result.code).toContain('__securityProvider.authenticate');
    expect(result.code).toContain("c.set('principal', __principal)");
  });
});

describe('OpenAPI Hono Plugin — @ApiResponse', () => {
  it('adds explicit response definitions', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Post, ApiResponse } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Post('/')
          @ApiResponse(201, 'Created successfully')
          @ApiResponse(409, 'Conflict')
          create() {}
        }
      `,
    });

    expect(result.code).toContain(
      '201: { description: "Created successfully" }',
    );
    expect(result.code).toContain('409: { description: "Conflict" }');
  });

  it('explicit responses override auto-inferred ones', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Post, ApiResponse } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Post('/')
          @ApiResponse(201, 'Custom created')
          create() {}
        }
      `,
    });

    // Should have the custom description, not the default 'Success'
    expect(result.code).toContain('201: { description: "Custom created" }');
    expect(result.code).not.toContain("{ description: 'Success' }");
  });
});

describe('OpenAPI Hono Plugin — @ApiOperation', () => {
  it('adds summary to createRoute', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, ApiOperation } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/')
          @ApiOperation({ summary: 'List all items' })
          list() {}
        }
      `,
    });

    expect(result.code).toContain('summary: "List all items"');
  });

  it('adds description to createRoute', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, ApiOperation } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/')
          @ApiOperation({ description: 'Returns a list of all items' })
          list() {}
        }
      `,
    });

    expect(result.code).toContain('description: "Returns a list of all items"');
  });

  it('adds deprecated flag to createRoute', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, ApiOperation } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/old')
          @ApiOperation({ deprecated: true })
          oldEndpoint() {}
        }
      `,
    });

    expect(result.code).toContain('deprecated: true');
  });

  it('uses custom tags from @ApiOperation', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, ApiOperation } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/')
          @ApiOperation({ tags: ['items', 'public'] })
          list() {}
        }
      `,
    });

    expect(result.code).toContain('tags: ["items","public"]');
  });
});

describe('OpenAPI Hono Plugin — @ApiTag', () => {
  it('uses class name as default tag', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          list() {}
        }
      `,
    });

    expect(result.code).toContain('tags: ["TodoController"]');
  });

  it('overrides default tag with @ApiTag', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, ApiTag } from './decorators.js'
        @ApiTag('Todos')
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          list() {}
        }
      `,
    });

    expect(result.code).toContain('tags: ["Todos"]');
  });

  it('@ApiOperation tags override @ApiTag for that method', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, ApiTag, ApiOperation } from './decorators.js'
        @ApiTag('Todos')
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          list() {}

          @Get('/special')
          @ApiOperation({ tags: ['Special'] })
          special() {}
        }
      `,
    });

    // list should use class tag
    const listRoute = result.code.match(
      /__todoController_list_route = createRoute\(\{.*?\}\s*\}\s*\)/s,
    )?.[0];
    expect(listRoute).toBeDefined();
    expect(listRoute).toContain('"Todos"');

    // special should use method tags
    const specialRoute = result.code.match(
      /__todoController_special_route = createRoute\(\{.*?\}\s*\}\s*\)/s,
    )?.[0];
    expect(specialRoute).toBeDefined();
    expect(specialRoute).toContain('"Special"');
  });
});

describe('OpenAPI Hono Plugin — OpenAPI Doc Endpoint', () => {
  it('generates doc endpoint with config', () => {
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

    expect(result.code).toContain("openApiApp.doc('/openapi.json'");
    expect(result.code).toContain("openapi: '3.1.0'");
    expect(result.code).toContain('title: config.title');
    expect(result.code).toContain('version: config.version');
  });

  it('resolves OpenApiConfig from context', () => {
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

    expect(result.code).toContain('const config = ctx.get(OpenApiConfig)');
  });
});

describe('OpenAPI Hono Plugin — Multiple Controllers', () => {
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

    expect(result.code).toContain('__userController_list_route');
    expect(result.code).toContain('__todoController_list_route');
    expect(result.code).toContain('__todoController_create_route');
    expect(result.code).toContain("path: '/api/users'");
    expect(result.code).toContain("path: '/api/todos'");
  });
});
