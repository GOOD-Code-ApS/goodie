import createHttpPlugin from '@goodie-ts/http/plugin';
import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';

const httpPlugin = createHttpPlugin();

function createProject(
  files: Record<string, string>,
  outputPath = '/out/AppContext.generated.ts',
  plugins = [httpPlugin],
) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return transformInMemory(project, outputPath, plugins);
}

describe('HTTP Controller Metadata', () => {
  it('stores httpController metadata on controller beans', () => {
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

    const bean = result.components.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'UserController',
    );
    const httpCtrl = bean!.metadata.httpController as {
      basePath: string;
      routes: Array<{ methodName: string; httpMethod: string }>;
    };
    expect(httpCtrl.basePath).toBe('/api/users');
    expect(httpCtrl.routes).toHaveLength(2);
    expect(httpCtrl.routes[0].httpMethod).toBe('get');
    expect(httpCtrl.routes[1].httpMethod).toBe('post');
  });

  it('stores parameter binding metadata for runtime wiring', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Post, Patch, HttpContext, Introspected } from './decorators.js'
        @Introspected()
        class CreateDto { title!: string }
        @Controller('/api')
        class Ctrl {
          @Get('/:id')
          getById(id: string, ctx: HttpContext) {}
          @Post('/')
          create(body: CreateDto) {}
          @Patch('/:id')
          update(id: string, body: CreateDto) {}
        }
      `,
    });

    const bean = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpCtrl = bean!.metadata.httpController as {
      routes: Array<{
        methodName: string;
        params: Array<{ name: string; binding: string; typeName: string }>;
      }>;
    };

    // GET /:id — path + context params
    expect(httpCtrl.routes[0].params).toEqual([
      { name: 'id', binding: 'path', typeName: 'string', optional: false },
      {
        name: 'ctx',
        binding: 'context',
        typeName: 'HttpContext',
        optional: false,
      },
    ]);

    // POST / — body param
    expect(httpCtrl.routes[1].params).toEqual([
      {
        name: 'body',
        binding: 'body',
        typeName: 'CreateDto',
        optional: false,
      },
    ]);

    // PATCH /:id — path + body
    expect(httpCtrl.routes[2].params).toEqual([
      { name: 'id', binding: 'path', typeName: 'string', optional: false },
      {
        name: 'body',
        binding: 'body',
        typeName: 'CreateDto',
        optional: false,
      },
    ]);
  });

  it('stores return type metadata for API schema', () => {
    const result = createProject({
      '/src/Ctrl.ts': `
        import { Controller, Get, Post, Response } from './decorators.js'
        interface Todo { id: string; title: string }
        @Controller('/api')
        class Ctrl {
          @Get('/')
          async list(): Promise<Todo[]> { return [] }
          @Post('/')
          async create(): Promise<Response<Todo>> { return Response.created({} as Todo) }
        }
      `,
    });

    const bean = result.components.find(
      (b) => b.tokenRef.kind === 'class' && b.tokenRef.className === 'Ctrl',
    );
    const httpCtrl = bean!.metadata.httpController as {
      routes: Array<{ methodName: string; returnType: string }>;
    };

    expect(httpCtrl.routes[0].returnType).toBe('Todo[]');
    expect(httpCtrl.routes[1].returnType).toBe('Todo');
  });

  it('does not generate hono-specific code when no controllers exist', () => {
    const result = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {}
      `,
    });

    expect(result.code).not.toContain('EmbeddedServer');
    expect(result.code).not.toContain('createHonoRouter');
  });
});
