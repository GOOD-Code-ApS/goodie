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
    expect(spec.paths['/api/todos/'].get.responses['200']).toBeDefined();

    expect(spec.paths['/api/todos/'].post).toBeDefined();
    expect(spec.paths['/api/todos/'].post.operationId).toBe('create');
    expect(spec.paths['/api/todos/'].post.responses['201']).toBeDefined();
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

  it('adds requestBody for routes with @Validate({ json: schema })', () => {
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

    const spec = parseOpenApiSpec(result);
    const op = spec.paths['/api/todos/'].post;
    expect(op.requestBody).toBeDefined();
    expect(op.requestBody.required).toBe(true);
    expect(op.requestBody.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/createTodoSchema',
    );
    expect(spec.components.schemas.createTodoSchema).toBeDefined();
  });

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
    expect(spec.paths['/api/users/'].get).toBeDefined();
    expect(spec.paths['/api/todos/']).toBeDefined();
    expect(spec.paths['/api/todos/'].get).toBeDefined();
    expect(spec.paths['/api/todos/'].post).toBeDefined();
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

  it('adds query parameters from @Validate({ query: schema })', () => {
    const result = createProject({
      '/src/schema.ts': `
        export const querySchema = {}
      `,
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
});
