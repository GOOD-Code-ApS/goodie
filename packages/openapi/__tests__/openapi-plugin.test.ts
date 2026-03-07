import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import createHonoPlugin from '../../hono/src/plugin.js';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import createOpenApiPlugin from '../src/plugin.js';

const honoPlugin = createHonoPlugin();
const openApiPlugin = createOpenApiPlugin();

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return transformInMemory(project, '/out/AppContext.generated.ts', [
    honoPlugin,
    openApiPlugin,
  ]);
}

function parseOpenApiSpec(result: ReturnType<typeof createProject>) {
  expect(result.files).toBeDefined();
  const specPath = Object.keys(result.files!).find((p) =>
    p.endsWith('openapi.json'),
  );
  expect(specPath).toBeDefined();
  return JSON.parse(result.files![specPath!]);
}

describe('OpenAPI Plugin', () => {
  // ── Basic route scanning ──

  it('generates openapi.json with correct paths from @Controller/@Get/@Post', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, Post } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          getAll() {}
          @Post('/')
          create() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('API');
    expect(spec.info.version).toBe('1.0.0');

    expect(spec.paths['/api/todos/']).toBeDefined();
    expect(spec.paths['/api/todos/'].get).toBeDefined();
    expect(spec.paths['/api/todos/'].get.operationId).toBe('getAll');
    expect(spec.paths['/api/todos/'].get.tags).toEqual(['TodoController']);

    expect(spec.paths['/api/todos/'].post).toBeDefined();
    expect(spec.paths['/api/todos/'].post.operationId).toBe('create');
  });

  it('converts :param to {param} in paths', () => {
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

    const spec = parseOpenApiSpec(result);
    expect(spec.paths['/api/todos/{id}']).toBeDefined();
    expect(spec.paths['/api/todos/{id}'].get).toBeDefined();
  });

  it('handles all HTTP methods', () => {
    const result = createProject({
      '/src/ResourceController.ts': `
        import { Controller, Get, Post, Put, Delete, Patch } from './decorators.js'
        @Controller('/api/resource')
        class ResourceController {
          @Get('/') list() {}
          @Post('/') create() {}
          @Put('/:id') update() {}
          @Delete('/:id') remove() {}
          @Patch('/:id') patch() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    expect(spec.paths['/api/resource/'].get).toBeDefined();
    expect(spec.paths['/api/resource/'].post).toBeDefined();
    expect(spec.paths['/api/resource/{id}'].put).toBeDefined();
    expect(spec.paths['/api/resource/{id}'].delete).toBeDefined();
    expect(spec.paths['/api/resource/{id}'].patch).toBeDefined();
  });

  it('multiple controllers generate separate path groups', () => {
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

    const spec = parseOpenApiSpec(result);
    expect(spec.paths['/api/users/']).toBeDefined();
    expect(spec.paths['/api/todos/']).toBeDefined();
    expect(spec.paths['/api/todos/'].post).toBeDefined();
  });

  it('returns empty when no controllers exist', () => {
    const result = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {}
      `,
    });

    expect(result.files).toBeUndefined();
  });

  // ── Auto-inferred responses ──

  it('infers 500 on all routes', () => {
    const result = createProject({
      '/src/SimpleController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/simple')
        class SimpleController {
          @Get('/')
          list() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/simple/'].get;
    expect(op.responses['200']).toEqual({ description: 'Successful response' });
    expect(op.responses['500']).toEqual({
      description: 'Internal server error',
    });
  });

  it('infers 400 on routes with @Validate', () => {
    const result = createProject({
      '/src/schema.ts': `export const createTodoSchema = {}`,
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

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/'].post;
    expect(op.responses['400']).toEqual({ description: 'Validation failed' });
    expect(op.responses['500']).toEqual({
      description: 'Internal server error',
    });
    expect(op.requestBody).toBeDefined();
    expect(op.requestBody.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/createTodoSchema',
    );
  });

  it('infers 404 on routes with path parameters', () => {
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

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/{id}'].get;
    expect(op.responses['404']).toEqual({ description: 'Not found' });
    expect(op.responses['500']).toEqual({
      description: 'Internal server error',
    });
  });

  it('does not infer 404 on routes without path parameters', () => {
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

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/'].get;
    expect(op.responses['404']).toBeUndefined();
  });

  // ── @ApiResponse decorator ──

  it('@ApiResponse adds explicit responses', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, ApiResponse } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/:id')
          @ApiResponse(404, 'Todo not found')
          @ApiResponse(403, 'Forbidden')
          getById() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/{id}'].get;
    // Explicit overrides auto-inferred 404
    expect(op.responses['404']).toEqual({ description: 'Todo not found' });
    expect(op.responses['403']).toEqual({ description: 'Forbidden' });
    // Auto-inferred still present
    expect(op.responses['200']).toEqual({ description: 'Successful response' });
    expect(op.responses['500']).toEqual({
      description: 'Internal server error',
    });
  });

  it('@ApiResponse overrides auto-inferred response for same status', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, ApiResponse } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          @ApiResponse(200, 'Returns a list of todos')
          @ApiResponse(500, 'Database unavailable')
          list() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/'].get;
    expect(op.responses['200']).toEqual({
      description: 'Returns a list of todos',
    });
    expect(op.responses['500']).toEqual({
      description: 'Database unavailable',
    });
  });

  it('@ApiResponse with schema adds $ref to response content', () => {
    const result = createProject({
      '/src/schema.ts': `
        export const todoSchema = {}
        export const errorSchema = {}
      `,
      '/src/TodoController.ts': `
        import { Controller, Get, ApiResponse } from './decorators.js'
        import { todoSchema, errorSchema } from './schema.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/:id')
          @ApiResponse(200, 'The requested todo', { schema: todoSchema })
          @ApiResponse(404, 'Todo not found', { schema: errorSchema })
          getById() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/{id}'].get;

    expect(op.responses['200'].description).toBe('The requested todo');
    expect(op.responses['200'].content).toEqual({
      'application/json': {
        schema: { $ref: '#/components/schemas/todoSchema' },
      },
    });

    expect(op.responses['404'].description).toBe('Todo not found');
    expect(op.responses['404'].content).toEqual({
      'application/json': {
        schema: { $ref: '#/components/schemas/errorSchema' },
      },
    });

    // Schema refs registered in components
    expect(spec.components.schemas.todoSchema).toEqual({ type: 'object' });
    expect(spec.components.schemas.errorSchema).toEqual({ type: 'object' });
  });

  it('@ApiResponse without schema has no content field', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, ApiResponse } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          @ApiResponse(200, 'List of todos')
          list() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/'].get;
    expect(op.responses['200'].description).toBe('List of todos');
    expect(op.responses['200'].content).toBeUndefined();
  });

  // ── @ApiOperation decorator ──

  it('@ApiOperation adds summary and description', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, ApiOperation } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/')
          @ApiOperation({ summary: 'List all todos', description: 'Returns all todos ordered by creation date' })
          list() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/'].get;
    expect(op.summary).toBe('List all todos');
    expect(op.description).toBe('Returns all todos ordered by creation date');
  });

  it('@ApiOperation marks deprecated operations', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, ApiOperation } from './decorators.js'
        @Controller('/api/todos')
        class TodoController {
          @Get('/old')
          @ApiOperation({ summary: 'Legacy endpoint', deprecated: true })
          oldList() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/old'].get;
    expect(op.deprecated).toBe(true);
    expect(op.summary).toBe('Legacy endpoint');
  });

  // ── @ApiTag decorator ──

  it('@ApiTag overrides the auto-generated tag', () => {
    const result = createProject({
      '/src/TodoController.ts': `
        import { Controller, Get, ApiTag } from './decorators.js'
        @Controller('/api/todos')
        @ApiTag('Todos')
        class TodoController {
          @Get('/')
          list() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/'].get;
    expect(op.tags).toEqual(['Todos']);
  });

  // ── Security ──

  it('adds security requirements for @Secured controllers', () => {
    const result = createProject({
      '/src/SecureController.ts': `
        import { Controller, Get, Secured } from './decorators.js'
        @Secured()
        @Controller('/api/secure')
        class SecureController {
          @Get('/')
          list() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/secure/'].get;
    expect(op.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.components.securitySchemes).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('excludes security for @Anonymous methods on @Secured controllers', () => {
    const result = createProject({
      '/src/MixedController.ts': `
        import { Controller, Get, Secured, Anonymous } from './decorators.js'
        @Secured()
        @Controller('/api/mixed')
        class MixedController {
          @Get('/protected')
          protectedRoute() {}

          @Anonymous()
          @Get('/public')
          publicRoute() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const protectedOp = spec.paths['/api/mixed/protected'].get;
    expect(protectedOp.security).toEqual([{ bearerAuth: [] }]);

    const publicOp = spec.paths['/api/mixed/public'].get;
    expect(publicOp.security).toBeUndefined();
  });

  it('adds security for method-level @Secured without class-level @Secured', () => {
    const result = createProject({
      '/src/MixedController.ts': `
        import { Controller, Get, Secured } from './decorators.js'
        @Controller('/api/mixed')
        class MixedController {
          @Get('/public')
          publicRoute() {}

          @Secured()
          @Get('/admin')
          adminRoute() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const publicOp = spec.paths['/api/mixed/public'].get;
    expect(publicOp.security).toBeUndefined();

    const adminOp = spec.paths['/api/mixed/admin'].get;
    expect(adminOp.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.components.securitySchemes).toBeDefined();
  });

  it('does not add securitySchemes when no route uses @Secured', () => {
    const result = createProject({
      '/src/PublicController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/public')
        class PublicController {
          @Get('/')
          list() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    expect(spec.components.securitySchemes).toBeUndefined();
  });

  // ── Path + Query parameters ──

  it('generates path parameters from route path', () => {
    const result = createProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/users')
        class UserController {
          @Get('/:userId/posts/:postId')
          getPost() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/users/{userId}/posts/{postId}'].get;
    expect(op.parameters).toBeDefined();
    expect(op.parameters).toHaveLength(2);

    const userIdParam = op.parameters.find(
      (p: { name: string }) => p.name === 'userId',
    );
    expect(userIdParam).toEqual({
      name: 'userId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });

    const postIdParam = op.parameters.find(
      (p: { name: string }) => p.name === 'postId',
    );
    expect(postIdParam).toEqual({
      name: 'postId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  });

  it('adds query parameters from @Validate({ query: schema })', () => {
    const result = createProject({
      '/src/schema.ts': `export const querySchema = {}`,
      '/src/SearchController.ts': `
        import { Controller, Get, Validate } from './decorators.js'
        import { querySchema } from './schema.js'
        @Controller('/api/search')
        class SearchController {
          @Get('/')
          @Validate({ query: querySchema })
          search() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/search/'].get;
    expect(op.parameters).toBeDefined();
    const queryParam = op.parameters.find(
      (p: { in: string }) => p.in === 'query',
    );
    expect(queryParam).toBeDefined();
    expect(queryParam.name).toBe('querySchema');
  });

  // ── Combined decorators ──

  it('combines @ApiOperation, @ApiResponse, @Validate, and auto-inferred responses', () => {
    const result = createProject({
      '/src/schema.ts': `export const createTodoSchema = {}`,
      '/src/TodoController.ts': `
        import { Controller, Post, Validate, Secured, ApiOperation, ApiResponse } from './decorators.js'
        @Secured()
        @Controller('/api/todos')
        class TodoController {
          @Post('/')
          @Validate({ json: createTodoSchema })
          @ApiOperation({ summary: 'Create a todo' })
          @ApiResponse(201, 'Todo created successfully')
          @ApiResponse(401, 'Authentication required')
          @ApiResponse(409, 'Todo already exists')
          create() {}
        }
      `,
    });

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/'].post;

    // @ApiOperation
    expect(op.summary).toBe('Create a todo');

    // Explicit @ApiResponse overrides
    expect(op.responses['201']).toEqual({
      description: 'Todo created successfully',
    });
    expect(op.responses['401']).toEqual({
      description: 'Authentication required',
    });
    expect(op.responses['409']).toEqual({
      description: 'Todo already exists',
    });

    // Auto-inferred (not overridden)
    expect(op.responses['400']).toEqual({ description: 'Validation failed' });
    expect(op.responses['500']).toEqual({
      description: 'Internal server error',
    });

    // Security
    expect(op.security).toEqual([{ bearerAuth: [] }]);

    // Request body from @Validate
    expect(op.requestBody).toBeDefined();
  });
});
