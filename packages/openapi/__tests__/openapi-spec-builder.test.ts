import type {
  ApplicationContext,
  BeanDefinition,
  TypeMetadata,
} from '@goodie-ts/core';
import { MetadataRegistry } from '@goodie-ts/core';
import type { ControllerMetadata } from '@goodie-ts/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenApiConfig } from '../src/openapi-config.js';
import { OpenApiSpecBuilder } from '../src/openapi-spec-builder.js';

// ── Helpers ──

class CreateTodoDto {}
class UpdateTodoDto {}
class Todo {}

function createMockConfig(
  overrides: Partial<OpenApiConfig> = {},
): OpenApiConfig {
  const config = new OpenApiConfig();
  config.title = overrides.title ?? 'Test API';
  config.version = overrides.version ?? '1.0.0';
  config.description = overrides.description ?? '';
  return config;
}

function createMockContext(
  controllers: Array<{
    name: string;
    metadata: ControllerMetadata;
  }>,
): ApplicationContext {
  const definitions = controllers.map((ctrl) => {
    // Create a named class so discoverControllers() can extract the name
    const NamedClass = { [ctrl.name]: class {} }[ctrl.name];
    return {
      token: NamedClass,
      scope: 'singleton' as const,
      dependencies: [],
      factory: () => null,
      eager: false,
      metadata: { httpController: ctrl.metadata },
    };
  }) as BeanDefinition[];

  return {
    getDefinitions: vi.fn().mockReturnValue(definitions),
  } as unknown as ApplicationContext;
}

function registerType(metadata: TypeMetadata): void {
  MetadataRegistry.INSTANCE.register(metadata);
}

// ── Tests ──

describe('OpenApiSpecBuilder', () => {
  beforeEach(() => {
    MetadataRegistry.INSTANCE.reset();
  });

  afterEach(() => {
    MetadataRegistry.INSTANCE.reset();
  });

  it('generates basic spec with info from config', () => {
    const ctx = createMockContext([]);
    const config = createMockConfig({
      title: 'My API',
      version: '2.0.0',
      description: 'A test API',
    });

    const builder = new OpenApiSpecBuilder(ctx, config);
    const spec = builder.getSpec() as any;

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('My API');
    expect(spec.info.version).toBe('2.0.0');
    expect(spec.info.description).toBe('A test API');
  });

  it('generates paths from controller routes', () => {
    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'list',
              httpMethod: 'get',
              path: '/',
              status: 200,
              params: [],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    expect(spec.paths['/api/todos']).toBeDefined();
    expect(spec.paths['/api/todos'].get).toBeDefined();
    expect(spec.paths['/api/todos'].get.operationId).toBe(
      'TodoController_list',
    );
  });

  it('converts :param to {param} in paths', () => {
    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'getById',
              httpMethod: 'get',
              path: '/:id',
              status: 200,
              params: [
                {
                  name: 'id',
                  binding: 'path',
                  typeName: 'string',
                  optional: false,
                },
              ],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    expect(spec.paths['/api/todos/{id}']).toBeDefined();
    expect(spec.paths['/api/todos/{id}'].get.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('includes query parameters', () => {
    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'list',
              httpMethod: 'get',
              path: '/',
              status: 200,
              params: [
                {
                  name: 'completed',
                  binding: 'query',
                  typeName: 'boolean',
                  optional: true,
                },
                {
                  name: 'limit',
                  binding: 'query',
                  typeName: 'number',
                  optional: true,
                },
              ],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    expect(spec.paths['/api/todos'].get.parameters).toEqual([
      {
        name: 'completed',
        in: 'query',
        required: false,
        schema: { type: 'boolean' },
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'number' },
      },
    ]);
  });

  it('generates request body from @Introspected body param', () => {
    registerType({
      type: CreateTodoDto,
      className: 'CreateTodoDto',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
      ],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'create',
              httpMethod: 'post',
              path: '/',
              status: 201,
              params: [
                {
                  name: 'body',
                  binding: 'body',
                  typeName: 'CreateTodoDto',
                  optional: false,
                },
              ],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const op = spec.paths['/api/todos'].post;
    expect(op.requestBody).toEqual({
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateTodoDto' },
        },
      },
    });

    expect(spec.components.schemas.CreateTodoDto).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      required: ['title'],
    });
  });

  it('generates response schema from return type', () => {
    registerType({
      type: Todo,
      className: 'Todo',
      fields: [
        {
          name: 'id',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'completed',
          type: { kind: 'primitive', type: 'boolean' },
          decorators: [],
        },
      ],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'getById',
              httpMethod: 'get',
              path: '/:id',
              status: 200,
              params: [
                {
                  name: 'id',
                  binding: 'path',
                  typeName: 'string',
                  optional: false,
                },
              ],
              returnType: 'Todo',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const response = spec.paths['/api/todos/{id}'].get.responses['200'];
    expect(response.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/Todo',
    });

    expect(spec.components.schemas.Todo).toBeDefined();
    expect(spec.components.schemas.Todo.properties.id).toEqual({
      type: 'string',
    });
  });

  it('handles array return types', () => {
    registerType({
      type: Todo,
      className: 'Todo',
      fields: [],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'list',
              httpMethod: 'get',
              path: '/',
              status: 200,
              params: [],
              returnType: 'Todo[]',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    expect(
      spec.paths['/api/todos'].get.responses['200'].content['application/json']
        .schema,
    ).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/Todo' },
    });
  });

  it('handles nullable return types', () => {
    registerType({
      type: Todo,
      className: 'Todo',
      fields: [],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'getById',
              httpMethod: 'get',
              path: '/:id',
              status: 200,
              params: [
                {
                  name: 'id',
                  binding: 'path',
                  typeName: 'string',
                  optional: false,
                },
              ],
              returnType: 'Todo | null',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    expect(
      spec.paths['/api/todos/{id}'].get.responses['200'].content[
        'application/json'
      ].schema,
    ).toEqual({
      oneOf: [{ $ref: '#/components/schemas/Todo' }, { type: 'null' }],
    });
  });

  it('maps constraint decorators to schema properties', () => {
    registerType({
      type: CreateTodoDto,
      className: 'CreateTodoDto',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [
            { name: 'NotBlank', args: {} },
            { name: 'MaxLength', args: { value: 255 } },
          ],
        },
        {
          name: 'priority',
          type: { kind: 'primitive', type: 'number' },
          decorators: [
            { name: 'Min', args: { value: 1 } },
            { name: 'Max', args: { value: 10 } },
          ],
        },
        {
          name: 'email',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'Email', args: {} }],
        },
        {
          name: 'slug',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'Pattern', args: { value: '^[a-z0-9-]+$' } }],
        },
        {
          name: 'tags',
          type: {
            kind: 'array',
            elementType: { kind: 'primitive', type: 'string' },
          },
          decorators: [{ name: 'Size', args: { value: 1, value2: 5 } }],
        },
      ],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api',
          routes: [
            {
              methodName: 'create',
              httpMethod: 'post',
              path: '/',
              status: 201,
              params: [
                {
                  name: 'body',
                  binding: 'body',
                  typeName: 'CreateTodoDto',
                  optional: false,
                },
              ],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const schema = spec.components.schemas.CreateTodoDto;
    expect(schema.properties.title).toEqual({
      type: 'string',
      minLength: 1,
      maxLength: 255,
    });
    expect(schema.properties.priority).toEqual({
      type: 'number',
      minimum: 1,
      maximum: 10,
    });
    expect(schema.properties.email).toEqual({
      type: 'string',
      format: 'email',
    });
    expect(schema.properties.slug).toEqual({
      type: 'string',
      pattern: '^[a-z0-9-]+$',
    });
    expect(schema.properties.tags).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 5,
    });
  });

  it('applies @Schema decorator metadata', () => {
    registerType({
      type: CreateTodoDto,
      className: 'CreateTodoDto',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [
            {
              name: 'Schema',
              args: {
                description: 'The title of the todo',
                example: 'Buy milk',
              },
            },
          ],
        },
        {
          name: 'status',
          type: { kind: 'primitive', type: 'string' },
          decorators: [
            {
              name: 'Schema',
              args: {
                enum: ['active', 'completed'],
                deprecated: true,
              },
            },
          ],
        },
      ],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api',
          routes: [
            {
              methodName: 'create',
              httpMethod: 'post',
              path: '/',
              status: 201,
              params: [
                {
                  name: 'body',
                  binding: 'body',
                  typeName: 'CreateTodoDto',
                  optional: false,
                },
              ],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const schema = spec.components.schemas.CreateTodoDto;
    expect(schema.properties.title).toEqual({
      type: 'string',
      description: 'The title of the todo',
      example: 'Buy milk',
    });
    expect(schema.properties.status).toEqual({
      type: 'string',
      enum: ['active', 'completed'],
      deprecated: true,
    });
  });

  it('handles nested @Introspected references', () => {
    class Address {}

    registerType({
      type: Address,
      className: 'Address',
      fields: [
        {
          name: 'street',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'city',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
      ],
    });

    registerType({
      type: CreateTodoDto,
      className: 'CreateTodoDto',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'address',
          type: { kind: 'reference', className: 'Address' },
          decorators: [],
        },
      ],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api',
          routes: [
            {
              methodName: 'create',
              httpMethod: 'post',
              path: '/',
              status: 201,
              params: [
                {
                  name: 'body',
                  binding: 'body',
                  typeName: 'CreateTodoDto',
                  optional: false,
                },
              ],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    expect(spec.components.schemas.CreateTodoDto.properties.address).toEqual({
      $ref: '#/components/schemas/Address',
    });
    expect(spec.components.schemas.Address).toBeDefined();
    expect(spec.components.schemas.Address.properties.street).toEqual({
      type: 'string',
    });
  });

  it('marks optional fields as not required', () => {
    registerType({
      type: UpdateTodoDto,
      className: 'UpdateTodoDto',
      fields: [
        {
          name: 'title',
          type: {
            kind: 'optional',
            inner: { kind: 'primitive', type: 'string' },
          },
          decorators: [],
        },
        {
          name: 'completed',
          type: {
            kind: 'optional',
            inner: { kind: 'primitive', type: 'boolean' },
          },
          decorators: [],
        },
      ],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api',
          routes: [
            {
              methodName: 'update',
              httpMethod: 'patch',
              path: '/:id',
              status: 200,
              params: [
                {
                  name: 'id',
                  binding: 'path',
                  typeName: 'string',
                  optional: false,
                },
                {
                  name: 'body',
                  binding: 'body',
                  typeName: 'UpdateTodoDto',
                  optional: false,
                },
              ],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const schema = spec.components.schemas.UpdateTodoDto;
    expect(schema.required).toBeUndefined();
    expect(schema.properties.title).toEqual({ type: 'string' });
    expect(schema.properties.completed).toEqual({ type: 'boolean' });
  });

  it('caches the spec on subsequent calls', () => {
    const ctx = createMockContext([]);
    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());

    const spec1 = builder.getSpec();
    const spec2 = builder.getSpec();

    expect(spec1).toBe(spec2);
  });

  it('handles void return type with no response body', () => {
    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'delete',
              httpMethod: 'delete',
              path: '/:id',
              status: 204,
              params: [
                {
                  name: 'id',
                  binding: 'path',
                  typeName: 'string',
                  optional: false,
                },
              ],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const response = spec.paths['/api/todos/{id}'].delete.responses['204'];
    expect(response.description).toBe('');
    expect(response.content).toBeUndefined();
  });

  it('uses custom status code from route metadata', () => {
    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'create',
              httpMethod: 'post',
              path: '/',
              status: 201,
              params: [],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    expect(spec.paths['/api/todos'].post.responses['201']).toBeDefined();
    expect(spec.paths['/api/todos'].post.responses['200']).toBeUndefined();
  });

  it('merges multiple routes on the same path', () => {
    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'list',
              httpMethod: 'get',
              path: '/',
              status: 200,
              params: [],
              returnType: 'void',
            },
            {
              methodName: 'create',
              httpMethod: 'post',
              path: '/',
              status: 201,
              params: [],
              returnType: 'void',
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    expect(spec.paths['/api/todos'].get).toBeDefined();
    expect(spec.paths['/api/todos'].post).toBeDefined();
  });

  it('applies @ApiOperation metadata to the operation', () => {
    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'list',
              httpMethod: 'get',
              path: '/',
              status: 200,
              params: [],
              returnType: 'void',
              decorators: [
                {
                  name: 'ApiOperation',
                  args: {
                    summary: 'List all todos',
                    description: 'Returns all todo items',
                    tags: ['todos'],
                    deprecated: false,
                  },
                },
              ],
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const op = spec.paths['/api/todos'].get;
    expect(op.summary).toBe('List all todos');
    expect(op.description).toBe('Returns all todo items');
    expect(op.tags).toEqual(['todos']);
    expect(op.deprecated).toBe(false);
  });

  it('applies @ApiResponse decorators to add response entries', () => {
    registerType({
      type: Todo,
      className: 'Todo',
      fields: [],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'getById',
              httpMethod: 'get',
              path: '/:id',
              status: 200,
              params: [
                {
                  name: 'id',
                  binding: 'path',
                  typeName: 'string',
                  optional: false,
                },
              ],
              returnType: 'Todo',
              decorators: [
                {
                  name: 'ApiResponse',
                  args: {
                    value: 200,
                    value2: { description: 'The todo item' },
                  },
                },
                {
                  name: 'ApiResponse',
                  args: {
                    value: 404,
                    value2: { description: 'Todo not found' },
                  },
                },
              ],
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const responses = spec.paths['/api/todos/{id}'].get.responses;
    expect(responses['200'].description).toBe('The todo item');
    expect(responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/Todo',
    });
    expect(responses['404']).toEqual({ description: 'Todo not found' });
  });

  it('applies @ApiResponse with type override', () => {
    registerType({
      type: Todo,
      className: 'Todo',
      fields: [],
    });

    class ErrorResponse {}
    registerType({
      type: ErrorResponse,
      className: 'ErrorResponse',
      fields: [
        {
          name: 'message',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
      ],
    });

    const ctx = createMockContext([
      {
        name: 'TodoController',
        metadata: {
          basePath: '/api/todos',
          routes: [
            {
              methodName: 'getById',
              httpMethod: 'get',
              path: '/:id',
              status: 200,
              params: [
                {
                  name: 'id',
                  binding: 'path',
                  typeName: 'string',
                  optional: false,
                },
              ],
              returnType: 'Todo',
              decorators: [
                {
                  name: 'ApiResponse',
                  args: {
                    value: 500,
                    value2: {
                      description: 'Internal server error',
                      type: 'ErrorResponse',
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    ]);

    const builder = new OpenApiSpecBuilder(ctx, createMockConfig());
    const spec = builder.getSpec() as any;

    const responses = spec.paths['/api/todos/{id}'].get.responses;
    expect(responses['500']).toEqual({
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    });
    expect(spec.components.schemas.ErrorResponse).toBeDefined();
  });
});
