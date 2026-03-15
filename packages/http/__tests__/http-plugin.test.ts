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
  it('registers @Controller as singleton component', () => {
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

    const component = result.components.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    expect(component).toBeDefined();
    expect(component!.scope).toBe('singleton');
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

    const component = result.components.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    const httpController = component!.metadata.httpController as {
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

    const component = result.components.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    const httpController = component!.metadata.httpController as {
      basePath: string;
      routes: Array<{
        methodName: string;
        httpMethod: string;
        path: string;
        status: number;
      }>;
    };

    expect(httpController.routes).toHaveLength(5);
    expect(httpController.routes[0]).toEqual({
      methodName: 'list',
      httpMethod: 'get',
      path: '/list',
      status: 200,
      returnType: 'void',
      params: [],
      decorators: [],
    });
    expect(httpController.routes[1]).toEqual({
      methodName: 'create',
      httpMethod: 'post',
      path: '/',
      status: 200,
      returnType: 'void',
      params: [],
      decorators: [],
    });
    expect(httpController.routes[2]).toEqual({
      methodName: 'update',
      httpMethod: 'put',
      path: '/:id',
      status: 200,
      returnType: 'void',
      params: [],
      decorators: [],
    });
    expect(httpController.routes[3]).toEqual({
      methodName: 'remove',
      httpMethod: 'delete',
      path: '/:id',
      status: 200,
      returnType: 'void',
      params: [],
      decorators: [],
    });
    expect(httpController.routes[4]).toEqual({
      methodName: 'patch',
      httpMethod: 'patch',
      path: '/:id',
      status: 200,
      returnType: 'void',
      params: [],
      decorators: [],
    });
  });

  it('does not store metadata for non-controller classes', () => {
    const result = createProject({
      '/src/Service.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class Service {}
      `,
    });

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Service',
    );
    expect(component!.metadata.httpController).toBeUndefined();
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

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      basePath: string;
    };
    expect(httpController.basePath).toBe('/');
  });

  it('detects HttpContext parameter and sets binding to context', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Post, HttpContext } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/')
          list() {}
          @Get('/:id')
          getById(id: string, ctx: HttpContext) {}
        }
      `,
    });

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{
        methodName: string;
        params: Array<{ name: string; binding: string }>;
      }>;
    };

    expect(httpController.routes[0].params).toEqual([]);
    expect(httpController.routes[1].params).toEqual([
      { name: 'id', binding: 'path', typeName: 'string', optional: false },
      {
        name: 'ctx',
        binding: 'context',
        typeName: 'HttpContext',
        optional: false,
      },
    ]);
  });

  it('throws compile-time error for body parameter on GET method', () => {
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
    ).toThrow(/can only be used as a request body on POST\/PUT\/PATCH/);
  });

  it('binds path param by name match', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/:id')
          getById(id: string) {}
        }
      `,
    });

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{
        params: Array<{ name: string; binding: string; typeName: string }>;
      }>;
    };
    expect(httpController.routes[0].params).toEqual([
      { name: 'id', binding: 'path', typeName: 'string', optional: false },
    ]);
  });

  it('binds path param + body param on PATCH', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Patch, Introspected } from './decorators.js'
        @Introspected()
        class UpdateDto { title!: string }
        @Controller('/api')
        class Ctrl {
          @Patch('/:id')
          update(id: string, body: UpdateDto) {}
        }
      `,
    });

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{
        params: Array<{
          name: string;
          binding: string;
          typeName: string;
          optional: boolean;
        }>;
      }>;
    };
    expect(httpController.routes[0].params).toEqual([
      { name: 'id', binding: 'path', typeName: 'string', optional: false },
      {
        name: 'body',
        binding: 'body',
        typeName: 'UpdateDto',
        optional: false,
        typeImportPath: '/src/Ctrl.ts',
      },
    ]);
  });

  it('binds non-path primitive as query param', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/search')
          search(query: string, limit: number) {}
        }
      `,
    });

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{
        params: Array<{ name: string; binding: string; typeName: string }>;
      }>;
    };
    expect(httpController.routes[0].params).toEqual([
      { name: 'query', binding: 'query', typeName: 'string', optional: false },
      { name: 'limit', binding: 'query', typeName: 'number', optional: false },
    ]);
  });

  it('binds primitive array as multi-valued query param', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/search')
          search(tags: string[], scores: number[]) {}
        }
      `,
    });

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{
        params: Array<{ name: string; binding: string; typeName: string }>;
      }>;
    };
    expect(httpController.routes[0].params).toEqual([
      { name: 'tags', binding: 'query', typeName: 'string[]', optional: false },
      {
        name: 'scores',
        binding: 'query',
        typeName: 'number[]',
        optional: false,
      },
    ]);
  });

  it('binds non-primitive array as body param', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Post, Introspected } from './decorators.js'
        @Introspected()
        class TodoDto { title!: string }
        @Controller('/api')
        class Ctrl {
          @Post('/batch')
          createBatch(items: TodoDto[]) {}
        }
      `,
    });

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{
        params: Array<{ name: string; binding: string; typeName: string }>;
      }>;
    };
    expect(httpController.routes[0].params).toEqual([
      {
        name: 'items',
        binding: 'body',
        typeName: 'TodoDto[]',
        optional: false,
        typeImportPath: expect.any(String),
      },
    ]);
  });

  it('reads @Status decorator for default status code', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Post, Status } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Status(201)
          @Post('/')
          create() {}
        }
      `,
    });

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{ status: number }>;
    };
    expect(httpController.routes[0].status).toBe(201);
  });

  it('defaults status to 200 when @Status not present', () => {
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

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{ status: number }>;
    };
    expect(httpController.routes[0].status).toBe(200);
  });

  it('throws when multiple @Status decorators on same method', () => {
    expect(() =>
      createProject({
        '/src/Ctrl.ts': `
          import { Controller, Post, Status } from './decorators.js'
          @Controller('/api')
          class Ctrl {
            @Status(201)
            @Status(202)
            @Post('/')
            create() {}
          }
        `,
      }),
    ).toThrow(/only one @Status decorator is allowed per method/);
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

    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{ path: string }>;
    };
    expect(httpController.routes[0].path).toBe('/');
  });
});

describe('HTTP Plugin — return type extraction', () => {
  function getReturnType(
    files: Record<string, string>,
    routeIndex = 0,
  ): string {
    const result = createProject(files);
    const component = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpController = component!.metadata.httpController as {
      routes: Array<{ returnType: string }>;
    };
    return httpController.routes[routeIndex].returnType;
  }

  it('captures plain return type', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        interface Todo { id: string; title: string }
        @Controller('/api')
        class Ctrl {
          @Get('/')
          list(): Todo[] { return [] }
        }
      `,
    });

    expect(returnType).toBe('Todo[]');
  });

  it('unwraps Promise<T>', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        interface Todo { id: string; title: string }
        @Controller('/api')
        class Ctrl {
          @Get('/')
          async list(): Promise<Todo[]> { return [] }
        }
      `,
    });

    expect(returnType).toBe('Todo[]');
  });

  it('unwraps Response<T>', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Post, Response } from './decorators.js'
        interface Todo { id: string; title: string }
        @Controller('/api')
        class Ctrl {
          @Post('/')
          create(): Response<Todo> { return Response.created({} as Todo) }
        }
      `,
    });

    expect(returnType).toBe('Todo');
  });

  it('unwraps Promise<Response<T>>', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Post, Response } from './decorators.js'
        interface Todo { id: string; title: string }
        @Controller('/api')
        class Ctrl {
          @Post('/')
          async create(): Promise<Response<Todo>> { return Response.created({} as Todo) }
        }
      `,
    });

    expect(returnType).toBe('Todo');
  });

  it('unwraps union of Response types', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Get, Response } from './decorators.js'
        interface Todo { id: string; title: string }
        @Controller('/api')
        class Ctrl {
          @Get('/:id')
          getById(id: string): Promise<Response<Todo> | Response<null>> { return null as any }
        }
      `,
    });

    expect(returnType).toBe('Todo | null');
  });

  it('returns void for methods with no return type', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Delete } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Delete('/:id')
          remove(id: string) {}
        }
      `,
    });

    expect(returnType).toBe('void');
  });

  it('handles Promise<void>', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Delete } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Delete('/:id')
          async remove(id: string): Promise<void> {}
        }
      `,
    });

    expect(returnType).toBe('void');
  });

  it('handles primitive return types', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Get('/count')
          count(): number { return 0 }
        }
      `,
    });

    expect(returnType).toBe('number');
  });

  it('handles Response<never> from noContent', () => {
    const returnType = getReturnType({
      '/src/Ctrl.ts': `
        import { Controller, Delete, Response } from './decorators.js'
        @Controller('/api')
        class Ctrl {
          @Delete('/:id')
          remove(id: string): Response<never> { return Response.noContent() }
        }
      `,
    });

    expect(returnType).toBe('never');
  });
});
