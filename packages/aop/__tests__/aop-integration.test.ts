import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import { createAopPlugin } from '../src/aop-transformer-plugin.js';

describe('AOP Integration — Generated Code', () => {
  function createProject(files: Record<string, string>) {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
    for (const [filePath, content] of Object.entries(files)) {
      project.createSourceFile(filePath, content);
    }
    return project;
  }

  it('generates buildInterceptorChain call in factory (not AopPostProcessor)', () => {
    const project = createProject({
      '/src/TimingInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class TimingInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { TimingInterceptor } from './TimingInterceptor.js'
        @Singleton() class MyService {
          @Around(TimingInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    // buildInterceptorChain is used instead of AopPostProcessor
    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).not.toContain('AopPostProcessor');

    // No synthetic AopPostProcessor bean
    const postProcessorBean = result.beans.find(
      (b) =>
        b.tokenRef.kind === 'class' &&
        b.tokenRef.className === 'AopPostProcessor',
    );
    expect(postProcessorBean).toBeUndefined();
  });

  it('imports buildInterceptorChain from @goodie-ts/aop', () => {
    const project = createProject({
      '/src/TimingInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class TimingInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { TimingInterceptor } from './TimingInterceptor.js'
        @Singleton() class MyService {
          @Around(TimingInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    expect(result.code).toContain(
      "import { buildInterceptorChain } from '@goodie-ts/aop'",
    );
  });

  it('interceptor class appears in dependencies array', () => {
    const project = createProject({
      '/src/TimingInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class TimingInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { TimingInterceptor } from './TimingInterceptor.js'
        @Singleton() class MyService {
          @Around(TimingInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    // The generated code should have TimingInterceptor as a dependency token for MyService
    expect(result.code).toContain('token: TimingInterceptor');
  });

  it('@Before and @After generate wrapper calls in factory', () => {
    const project = createProject({
      '/src/LogAdvice.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class LogAdvice {}
      `,
      '/src/MetricsAdvice.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class MetricsAdvice {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Before, After } from './decorators.js'
        import { LogAdvice } from './LogAdvice.js'
        import { MetricsAdvice } from './MetricsAdvice.js'
        @Singleton() class MyService {
          @Before(LogAdvice)
          @After(MetricsAdvice)
          process() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    expect(result.code).toContain('wrapBeforeAdvice');
    expect(result.code).toContain('wrapAfterAdvice');
    expect(result.code).toContain(
      "import { buildInterceptorChain, wrapBeforeAdvice, wrapAfterAdvice } from '@goodie-ts/aop'",
    );
  });

  it('multiple methods with different interceptors', () => {
    const project = createProject({
      '/src/AuthInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class AuthInterceptor {}
      `,
      '/src/CacheInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class CacheInterceptor {}
      `,
      '/src/MyService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { AuthInterceptor } from './AuthInterceptor.js'
        import { CacheInterceptor } from './CacheInterceptor.js'
        @Singleton() class MyService {
          @Around(AuthInterceptor)
          secure() {}

          @Around(CacheInterceptor)
          getData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    // Both methods should be wrapped
    expect(result.code).toContain("'secure'");
    expect(result.code).toContain("'getData'");
    expect(result.code).toContain('buildInterceptorChain');
  });

  it('bean with no interception has normal factory (no buildInterceptorChain)', () => {
    const project = createProject({
      '/src/TimingInterceptor.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() export class TimingInterceptor {}
      `,
      '/src/PlainService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton() class PlainService {
          doWork() {}
        }
      `,
      '/src/InterceptedService.ts': `
        import { Singleton, Around } from './decorators.js'
        import { TimingInterceptor } from './TimingInterceptor.js'
        @Singleton() class InterceptedService {
          @Around(TimingInterceptor)
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createAopPlugin(),
    ]);

    // PlainService should have a simple factory
    // InterceptedService should have buildInterceptorChain
    const lines = result.code.split('\n');
    const plainServiceLine = lines.find((l) => l.includes('new PlainService'));
    const interceptedLine = lines.find((l) =>
      l.includes('new InterceptedService'),
    );

    expect(plainServiceLine).toBeDefined();
    expect(plainServiceLine).not.toContain('buildInterceptorChain');
    expect(interceptedLine).toBeDefined();
  });
});
