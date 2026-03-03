import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { createLoggingPlugin } from '../src/logging-transformer-plugin.js';
import { DECORATOR_STUBS } from './helpers.js';

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

describe('Logging Transformer Plugin', () => {
  it('should add LoggingInterceptor to interceptedMethods for @Log decorated methods', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('LoggingInterceptor');
    expect(result.code).toContain(
      "import { LoggingInterceptor } from '@goodie-ts/logging'",
    );
    expect(result.code).toContain(
      "import { buildInterceptorChain } from '@goodie-ts/aop'",
    );
  });

  it('should generate metadata with level info by default', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    expect(result.code).toContain('"level":"info"');
  });

  it('should generate metadata with debug level when specified', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log({ level: 'debug' })
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    expect(result.code).toContain('"level":"debug"');
  });

  it('should add LoggingInterceptor as a dependency in the bean definition', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    // LoggingInterceptor should appear in dependencies array
    expect(result.code).toContain('token: LoggingInterceptor');
  });

  it('should generate a synthetic LoggingInterceptor bean', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    // Should have a bean definition with token: LoggingInterceptor
    const lines = result.code.split('\n');
    const beanTokenLines = lines.filter((l) =>
      l.includes('token: LoggingInterceptor'),
    );
    // At least 2: one in dependencies, one as the bean's own token
    expect(beanTokenLines.length).toBeGreaterThanOrEqual(2);
  });

  it('should not add interceptor when no @Log decorators are present', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    expect(result.code).not.toContain('LoggingInterceptor');
    expect(result.code).not.toContain('buildInterceptorChain');
  });

  it('should handle multiple @Log methods on the same class', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          doWork() {}
          @Log({ level: 'debug' })
          doOtherWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    expect(result.code).toContain('instance.doWork = buildInterceptorChain');
    expect(result.code).toContain(
      'instance.doOtherWork = buildInterceptorChain',
    );
  });

  it('should generate metadata with logArgs false by default', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    expect(result.code).toContain('"logArgs":false');
  });

  it('should generate metadata with logArgs true when specified', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log({ logArgs: true })
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createLoggingPlugin(),
    ]);

    expect(result.code).toContain('"logArgs":true');
  });

  it('should clear state between rebuilds (no duplicate entries on plugin reuse)', () => {
    const plugin = createLoggingPlugin();

    // First transform
    const project1 = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          doWork() {}
        }
      `,
    });
    const result1 = transformInMemory(
      project1,
      '/out/AppContext.generated.ts',
      [plugin],
    );

    // Second transform with the same plugin instance (simulates watch-mode rebuild)
    const project2 = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          doWork() {}
        }
      `,
    });
    const result2 = transformInMemory(
      project2,
      '/out/AppContext.generated.ts',
      [plugin],
    );

    // Strip timestamp comment (first line) since it varies between runs
    const stripTimestamp = (code: string) =>
      code.split('\n').slice(1).join('\n');
    expect(stripTimestamp(result1.code)).toBe(stripTimestamp(result2.code));

    // There should be exactly one buildInterceptorChain call for doWork
    const chainCalls1 = result1.code
      .split('\n')
      .filter((l) => l.includes('instance.doWork = buildInterceptorChain'));
    const chainCalls2 = result2.code
      .split('\n')
      .filter((l) => l.includes('instance.doWork = buildInterceptorChain'));
    expect(chainCalls1).toHaveLength(1);
    expect(chainCalls2).toHaveLength(1);
  });

  it('should coexist with @Around from AOP plugin', async () => {
    const { createAopPlugin } = await import('@goodie-ts/aop');

    const project = createProject({
      '/src/TimingInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        export class TimingInterceptor {
          intercept(ctx: any) { return ctx.proceed() }
        }
      `,
      '/src/MyService.ts': `
        import { Singleton, Log, Around } from './decorators.js'
        import { TimingInterceptor } from './TimingInterceptor.js'
        @Singleton()
        class MyService {
          @Log()
          @Around(TimingInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
      createLoggingPlugin(),
    ]);

    // Both interceptors should be in the chain
    expect(result.code).toContain('LoggingInterceptor');
    expect(result.code).toContain('TimingInterceptor');
    expect(result.code).toContain('buildInterceptorChain');
  });
});
