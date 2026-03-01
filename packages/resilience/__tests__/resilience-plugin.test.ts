import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import { createResiliencePlugin } from '../src/resilience-transformer-plugin.js';

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

describe('Resilience Transformer Plugin', () => {
  it('should add RetryInterceptor for @Retryable decorated methods', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Retryable } from './decorators.js'
        @Singleton()
        class MyService {
          @Retryable()
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createResiliencePlugin(),
    ]);

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('RetryInterceptor');
    expect(result.code).toContain(
      "import { RetryInterceptor } from '@goodie-ts/resilience'",
    );
    expect(result.code).toContain(
      "import { buildInterceptorChain } from '@goodie-ts/aop'",
    );
  });

  it('should generate default retry metadata', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Retryable } from './decorators.js'
        @Singleton()
        class MyService {
          @Retryable()
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createResiliencePlugin(),
    ]);

    expect(result.code).toContain('"maxAttempts":3');
    expect(result.code).toContain('"delay":1000');
    expect(result.code).toContain('"multiplier":1');
  });

  it('should parse custom retry options', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Retryable } from './decorators.js'
        @Singleton()
        class MyService {
          @Retryable({ maxAttempts: 5, delay: 500, multiplier: 2 })
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createResiliencePlugin(),
    ]);

    expect(result.code).toContain('"maxAttempts":5');
    expect(result.code).toContain('"delay":500');
    expect(result.code).toContain('"multiplier":2');
  });

  it('should add CircuitBreakerInterceptor for @CircuitBreaker', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, CircuitBreaker } from './decorators.js'
        @Singleton()
        class MyService {
          @CircuitBreaker({ failureThreshold: 3, resetTimeout: 5000 })
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createResiliencePlugin(),
    ]);

    expect(result.code).toContain('CircuitBreakerInterceptor');
    expect(result.code).toContain('"failureThreshold":3');
    expect(result.code).toContain('"resetTimeout":5000');
  });

  it('should add TimeoutInterceptor for @Timeout', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Timeout } from './decorators.js'
        @Singleton()
        class MyService {
          @Timeout(3000)
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createResiliencePlugin(),
    ]);

    expect(result.code).toContain('TimeoutInterceptor');
    expect(result.code).toContain('"duration":3000');
  });

  it('should handle multiple resilience decorators on the same method', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Retryable, CircuitBreaker, Timeout } from './decorators.js'
        @Singleton()
        class MyService {
          @Timeout(5000)
          @CircuitBreaker()
          @Retryable({ maxAttempts: 3 })
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createResiliencePlugin(),
    ]);

    expect(result.code).toContain('RetryInterceptor');
    expect(result.code).toContain('CircuitBreakerInterceptor');
    expect(result.code).toContain('TimeoutInterceptor');
    // All three should be imported
    expect(result.code).toContain("from '@goodie-ts/resilience'");
  });

  it('should not add interceptors when no resilience decorators are present', () => {
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
      createResiliencePlugin(),
    ]);

    expect(result.code).not.toContain('RetryInterceptor');
    expect(result.code).not.toContain('CircuitBreakerInterceptor');
    expect(result.code).not.toContain('TimeoutInterceptor');
    expect(result.code).not.toContain('buildInterceptorChain');
  });

  it('should only add synthetic beans for interceptors actually used', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Retryable } from './decorators.js'
        @Singleton()
        class MyService {
          @Retryable()
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createResiliencePlugin(),
    ]);

    expect(result.code).toContain('RetryInterceptor');
    expect(result.code).not.toContain('CircuitBreakerInterceptor');
    expect(result.code).not.toContain('TimeoutInterceptor');
  });
});
