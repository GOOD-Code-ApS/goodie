import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

describe('EmbeddedServer Codegen', () => {
  it('generates EmbeddedServer bean when @Controller classes exist', () => {
    const project = createProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/users')
        class UserController {
          @Get('/')
          list() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts');

    expect(result.code).toContain('token: EmbeddedServer,');
    expect(result.code).toContain('new EmbeddedServer(__honoApp)');
  });

  it('imports EmbeddedServer and Hono', () => {
    const project = createProject({
      '/src/UserController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/api/users')
        class UserController {
          @Get('/')
          list() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts');

    expect(result.code).toContain(
      "import { EmbeddedServer } from '@goodie-ts/hono'",
    );
    expect(result.code).toContain("import { Hono } from 'hono'");
  });

  it('generates startServer that uses EmbeddedServer.listen()', () => {
    const project = createProject({
      '/src/MyController.ts': `
        import { Controller, Get } from './decorators.js'
        @Controller('/')
        class MyController {
          @Get('/')
          index() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts');

    expect(result.code).toContain('export async function startServer');
    expect(result.code).toContain('await app.start()');
    expect(result.code).toContain('ctx.get(EmbeddedServer).listen(options)');
  });

  it('wires routes in the EmbeddedServer factory', () => {
    const project = createProject({
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

    const result = transformInMemory(project, '/out/AppContext.generated.ts');

    expect(result.code).toContain("__honoApp.get('/api/users'");
    expect(result.code).toContain("__honoApp.post('/api/users'");
    expect(result.code).toContain('userController.list(c)');
    expect(result.code).toContain('userController.create(c)');
  });

  it('does not generate EmbeddedServer when no controllers exist', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {}
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts');

    expect(result.code).not.toContain('EmbeddedServer');
    expect(result.code).not.toContain('startServer');
    expect(result.code).not.toContain('Hono');
  });

  it('handles multiple controllers', () => {
    const project = createProject({
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

    const result = transformInMemory(project, '/out/AppContext.generated.ts');

    expect(result.code).toContain('token: EmbeddedServer,');
    expect(result.code).toContain('export async function startServer');
    expect(result.code).toContain("__honoApp.get('/api/users'");
    expect(result.code).toContain("__honoApp.get('/api/todos'");
    expect(result.code).toContain("__honoApp.post('/api/todos'");
  });
});
