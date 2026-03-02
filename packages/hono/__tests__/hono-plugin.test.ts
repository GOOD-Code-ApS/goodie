import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import { createHonoPlugin } from '../src/hono-transformer-plugin.js';

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

describe('Hono Transformer Plugin', () => {
  it('generates startServer() when @Controller classes exist', () => {
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

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHonoPlugin(),
    ]);

    expect(result.code).toContain('export async function startServer');
  });

  it('imports serve from @hono/node-server', () => {
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

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHonoPlugin(),
    ]);

    expect(result.code).toContain("import { serve } from '@hono/node-server'");
  });

  it('startServer calls app.start() and createRouter()', () => {
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

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHonoPlugin(),
    ]);

    expect(result.code).toContain('await app.start()');
    expect(result.code).toContain('createRouter(ctx)');
  });

  it('startServer accepts optional port', () => {
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

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHonoPlugin(),
    ]);

    expect(result.code).toContain('options?.port');
    expect(result.code).toContain('serve({ fetch: router.fetch, port })');
  });

  it('does not generate startServer when no controllers exist', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {}
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHonoPlugin(),
    ]);

    expect(result.code).not.toContain('startServer');
    expect(result.code).not.toContain('@hono/node-server');
  });

  it('coexists with createRouter generation', () => {
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

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHonoPlugin(),
    ]);

    // Both should be present — createRouter for manual use, startServer for auto-start
    expect(result.code).toContain('export function createRouter');
    expect(result.code).toContain('export async function startServer');
  });

  it('generates startServer with multiple controllers', () => {
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

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createHonoPlugin(),
    ]);

    // startServer uses createRouter which handles all controllers
    expect(result.code).toContain('export async function startServer');
    expect(result.code).toContain('export function createRouter');
  });
});
