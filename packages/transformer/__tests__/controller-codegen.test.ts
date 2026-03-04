import type {
  IRBeanDefinition,
  IRControllerDefinition,
  IRRouteValidation,
} from '@goodie-ts/transformer';
import { describe, expect, it } from 'vitest';
import { generateCode } from '../src/codegen.js';

const loc = { filePath: '/src/test.ts', line: 1, column: 1 };

describe('Controller Codegen', () => {
  it('should generate EmbeddedServer bean when controllers with routes exist', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'UserController',
          importPath: '/src/UserController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'UserController',
          importPath: '/src/UserController.ts',
        },
        basePath: '/users',
        routes: [
          { methodName: 'getAll', httpMethod: 'get', path: '/' },
          { methodName: 'create', httpMethod: 'post', path: '/' },
        ],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain("import { Hono } from 'hono'");
    expect(code).toContain("import { EmbeddedServer } from '@goodie-ts/hono'");
    expect(code).toContain('token: EmbeddedServer,');
    expect(code).toContain('new Hono()');
    expect(code).toContain("__honoApp.get('/users'");
    expect(code).toContain('userController.getAll(c)');
    expect(code).toContain("__honoApp.post('/users'");
    expect(code).toContain('userController.create(c)');
    expect(code).toContain('new EmbeddedServer(__honoApp)');
    expect(code).toContain('export async function startServer');
  });

  it('should correctly prefix routes with basePath', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'TodoController',
          importPath: '/src/TodoController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'TodoController',
          importPath: '/src/TodoController.ts',
        },
        basePath: '/api/todos',
        routes: [
          { methodName: 'getAll', httpMethod: 'get', path: '/' },
          { methodName: 'getById', httpMethod: 'get', path: '/:id' },
        ],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain("__honoApp.get('/api/todos'");
    expect(code).toContain("__honoApp.get('/api/todos/:id'");
  });

  it('should list all controllers as EmbeddedServer dependencies', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'UserController',
          importPath: '/src/UserController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'class',
          className: 'TodoController',
          importPath: '/src/TodoController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'UserController',
          importPath: '/src/UserController.ts',
        },
        basePath: '/users',
        routes: [{ methodName: 'getAll', httpMethod: 'get', path: '/' }],
      },
      {
        classTokenRef: {
          kind: 'class',
          className: 'TodoController',
          importPath: '/src/TodoController.ts',
        },
        basePath: '/todos',
        routes: [{ methodName: 'list', httpMethod: 'get', path: '/' }],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain('token: UserController, optional: false');
    expect(code).toContain('token: TodoController, optional: false');
    expect(code).toContain("__honoApp.get('/users'");
    expect(code).toContain("__honoApp.get('/todos'");
  });

  it('should not generate EmbeddedServer when no controllers', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Service',
          importPath: '/src/Service.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const code = generateCode(beans, {
      outputPath: '/out/AppContext.generated.ts',
    });

    expect(code).not.toContain('EmbeddedServer');
    expect(code).not.toContain("import { Hono } from 'hono'");
    expect(code).not.toContain('startServer');
  });

  it('should generate EmbeddedServer even when controllers have no routes', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'EmptyController',
          importPath: '/src/EmptyController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'EmptyController',
          importPath: '/src/EmptyController.ts',
        },
        basePath: '/empty',
        routes: [],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain('token: EmbeddedServer,');
    expect(code).toContain('new EmbeddedServer(__honoApp)');
    expect(code).toContain('startServer');
  });

  it('should generate Response passthrough in route handlers', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'ApiController',
          importPath: '/src/ApiController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'ApiController',
          importPath: '/src/ApiController.ts',
        },
        basePath: '/api',
        routes: [{ methodName: 'getData', httpMethod: 'get', path: '/data' }],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain('if (result instanceof Response) return result');
    expect(code).toContain('return c.json(result)');
  });

  it('should generate void/null guard for route handlers', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Ctrl',
          importPath: '/src/Ctrl.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'Ctrl',
          importPath: '/src/Ctrl.ts',
        },
        basePath: '/',
        routes: [{ methodName: 'action', httpMethod: 'post', path: '/' }],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain(
      'if (result === undefined || result === null) return c.body(null, 204)',
    );
  });

  it('should use collision-safe variable names for controllers with same camelCase', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'UserController',
          importPath: '/src/UserController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
      {
        tokenRef: {
          kind: 'class',
          className: 'UserControllerV2',
          importPath: '/src/UserControllerV2.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'UserController',
          importPath: '/src/UserController.ts',
        },
        basePath: '/v1/users',
        routes: [{ methodName: 'list', httpMethod: 'get', path: '/' }],
      },
      {
        classTokenRef: {
          kind: 'class',
          className: 'UserControllerV2',
          importPath: '/src/UserControllerV2.ts',
        },
        basePath: '/v2/users',
        routes: [{ methodName: 'list', httpMethod: 'get', path: '/' }],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    // Different class names produce different factory param names
    expect(code).toContain('userController: any');
    expect(code).toContain('userControllerV2: any');
  });

  it('should handle all HTTP methods in routes', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Ctrl',
          importPath: '/src/Ctrl.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'Ctrl',
          importPath: '/src/Ctrl.ts',
        },
        basePath: '/r',
        routes: [
          { methodName: 'a', httpMethod: 'get', path: '/' },
          { methodName: 'b', httpMethod: 'post', path: '/' },
          { methodName: 'c', httpMethod: 'put', path: '/' },
          { methodName: 'd', httpMethod: 'delete', path: '/' },
          { methodName: 'e', httpMethod: 'patch', path: '/' },
        ],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain("__honoApp.get('/r'");
    expect(code).toContain("__honoApp.post('/r'");
    expect(code).toContain("__honoApp.put('/r'");
    expect(code).toContain("__honoApp.delete('/r'");
    expect(code).toContain("__honoApp.patch('/r'");
  });

  it('should generate startServer that uses EmbeddedServer.listen()', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'Ctrl',
          importPath: '/src/Ctrl.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'Ctrl',
          importPath: '/src/Ctrl.ts',
        },
        basePath: '/',
        routes: [{ methodName: 'index', httpMethod: 'get', path: '/' }],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain('export async function startServer');
    expect(code).toContain('await app.start()');
    expect(code).toContain('ctx.get(EmbeddedServer).listen(options)');
    expect(code).toContain('return ctx');
  });

  it('should emit zValidator middleware for validated routes', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'TodoController',
          importPath: '/src/TodoController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const validation: IRRouteValidation[] = [
      {
        target: 'json',
        schemaRef: 'createTodoSchema',
        importPath: '/src/schema.ts',
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'TodoController',
          importPath: '/src/TodoController.ts',
        },
        basePath: '/api/todos',
        routes: [
          {
            methodName: 'create',
            httpMethod: 'post',
            path: '/',
            validation,
          },
        ],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain("import { zValidator } from '@hono/zod-validator'");
    expect(code).toContain(
      "import { createTodoSchema } from '../src/schema.js'",
    );
    expect(code).toContain("zValidator('json', createTodoSchema");
    expect(code).toContain('Validation failed');
    expect(code).toContain('todoController.create(c)');
  });

  it('should emit multiple validation middleware for multiple targets', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'ItemController',
          importPath: '/src/ItemController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'ItemController',
          importPath: '/src/ItemController.ts',
        },
        basePath: '/items',
        routes: [
          {
            methodName: 'getById',
            httpMethod: 'get',
            path: '/:id',
            validation: [
              {
                target: 'param',
                schemaRef: 'paramSchema',
                importPath: '/src/schemas.ts',
              },
              {
                target: 'query',
                schemaRef: 'querySchema',
                importPath: '/src/schemas.ts',
              },
            ],
          },
        ],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).toContain("zValidator('param', paramSchema");
    expect(code).toContain("zValidator('query', querySchema");
    // Both schemas from same file should produce a single import
    expect(code).toContain("import { paramSchema } from '../src/schemas.js'");
    expect(code).toContain("import { querySchema } from '../src/schemas.js'");
  });

  it('should not emit zValidator import when no routes have validation', () => {
    const beans: IRBeanDefinition[] = [
      {
        tokenRef: {
          kind: 'class',
          className: 'PlainController',
          importPath: '/src/PlainController.ts',
        },
        scope: 'singleton',
        eager: false,
        name: undefined,
        constructorDeps: [],
        fieldDeps: [],
        factoryKind: 'constructor',
        providesSource: undefined,
        metadata: {},
        sourceLocation: loc,
      },
    ];

    const controllers: IRControllerDefinition[] = [
      {
        classTokenRef: {
          kind: 'class',
          className: 'PlainController',
          importPath: '/src/PlainController.ts',
        },
        basePath: '/',
        routes: [{ methodName: 'index', httpMethod: 'get', path: '/' }],
      },
    ];

    const code = generateCode(
      beans,
      { outputPath: '/out/AppContext.generated.ts' },
      undefined,
      controllers,
    );

    expect(code).not.toContain('zValidator');
    expect(code).not.toContain('@hono/zod-validator');
  });
});
