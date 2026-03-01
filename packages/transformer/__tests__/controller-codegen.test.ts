import type {
  IRBeanDefinition,
  IRControllerDefinition,
} from '@goodie-ts/transformer';
import { describe, expect, it } from 'vitest';
import { generateCode } from '../src/codegen.js';

const loc = { filePath: '/src/test.ts', line: 1, column: 1 };

describe('Controller Codegen', () => {
  it('should generate createRouter() when controllers with routes exist', () => {
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
      controllers,
    );

    expect(code).toContain("import { Hono } from 'hono'");
    expect(code).toContain(
      'export function createRouter(ctx: ApplicationContext): Hono',
    );
    expect(code).toContain('const userController = ctx.get(UserController)');
    expect(code).toContain("app.get('/users'");
    expect(code).toContain('userController.getAll(c)');
    expect(code).toContain("app.post('/users'");
    expect(code).toContain('userController.create(c)');
    expect(code).toContain('return app');
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
      controllers,
    );

    expect(code).toContain("app.get('/api/todos'");
    expect(code).toContain("app.get('/api/todos/:id'");
  });

  it('should generate multiple controller variable assignments', () => {
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
      controllers,
    );

    expect(code).toContain('const userController = ctx.get(UserController)');
    expect(code).toContain('const todoController = ctx.get(TodoController)');
    expect(code).toContain("app.get('/users'");
    expect(code).toContain("app.get('/todos'");
  });

  it('should not generate createRouter() when no controllers', () => {
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

    expect(code).not.toContain('createRouter');
    expect(code).not.toContain("import { Hono } from 'hono'");
  });

  it('should not generate createRouter() when controllers have no routes', () => {
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
      controllers,
    );

    expect(code).not.toContain('createRouter');
    expect(code).not.toContain("import { Hono } from 'hono'");
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
      controllers,
    );

    expect(code).toContain('if (result instanceof Response) return result');
    expect(code).toContain('return c.json(result)');
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
      controllers,
    );

    expect(code).toContain("app.get('/r'");
    expect(code).toContain("app.post('/r'");
    expect(code).toContain("app.put('/r'");
    expect(code).toContain("app.delete('/r'");
    expect(code).toContain("app.patch('/r'");
  });
});
