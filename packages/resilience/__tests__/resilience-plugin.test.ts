import type {
  IRComponentDefinition,
  ResolvedAopMapping,
} from '@goodie-ts/transformer';
import {
  createDeclarativeAopPlugin,
  transformInMemory,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';

const RESILIENCE_MAPPINGS: ResolvedAopMapping[] = [
  {
    decoratorName: 'Retryable',
    declaration: {
      interceptor: 'RetryInterceptor',
      order: -10,
      defaults: { maxAttempts: 3, delay: 1000, multiplier: 1 },
    },
    packageName: '@goodie-ts/resilience',
  },
  {
    decoratorName: 'CircuitBreaker',
    declaration: {
      interceptor: 'CircuitBreakerInterceptor',
      order: -20,
      defaults: {
        failureThreshold: 5,
        resetTimeout: 30000,
        halfOpenAttempts: 1,
      },
    },
    packageName: '@goodie-ts/resilience',
  },
  {
    decoratorName: 'Timeout',
    declaration: {
      interceptor: 'TimeoutInterceptor',
      order: -30,
      argMapping: ['duration'],
      defaults: { duration: 5000 },
    },
    packageName: '@goodie-ts/resilience',
  },
];

function makeInterceptorBean(className: string): IRComponentDefinition {
  return {
    tokenRef: {
      kind: 'class',
      className,
      importPath: '@goodie-ts/resilience',
    },
    scope: 'singleton',
    eager: false,
    name: undefined,
    constructorDeps: [],
    fieldDeps: [],
    factoryKind: 'constructor',
    providesSource: undefined,
    metadata: {},
    sourceLocation: {
      filePath: '@goodie-ts/resilience',
      line: 0,
      column: 0,
    },
  };
}

const RESILIENCE_LIBRARY_BEANS: IRComponentDefinition[] = [
  makeInterceptorBean('RetryInterceptor'),
  makeInterceptorBean('CircuitBreakerInterceptor'),
  makeInterceptorBean('TimeoutInterceptor'),
];

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('RetryInterceptor');
    expect(result.code).toContain("from '@goodie-ts/resilience'");
    expect(result.code).toContain(
      "import { buildInterceptorChain } from '@goodie-ts/core'",
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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

    expect(result.code).not.toContain('buildInterceptorChain');
  });

  it('should only wire interceptors actually used into AOP chain', () => {
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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

    // Only RetryInterceptor should appear in the interceptor chain
    expect(result.code).toContain('buildInterceptorChain([__interceptor0]');
    // The other interceptors exist as library beans but aren't in the AOP chain
    expect(result.code).not.toContain(
      'instance.fetchData = buildInterceptorChain([__interceptor0, __interceptor1',
    );
  });

  it('should handle @Timeout with object literal argument', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Timeout } from './decorators.js'
        @Singleton()
        class MyService {
          @Timeout({ duration: 3000 })
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

    // Generic parser handles { duration: 3000 } correctly
    expect(result.code).toContain('"duration":3000');
  });

  it('should handle TypeScript numeric separators in options', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Retryable } from './decorators.js'
        @Singleton()
        class MyService {
          @Retryable({ maxAttempts: 5, delay: 1_000 })
          fetchData() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      RESILIENCE_LIBRARY_BEANS,
      RESILIENCE_MAPPINGS,
    );

    expect(result.code).toContain('"maxAttempts":5');
    expect(result.code).toContain('"delay":1000');
  });

  it('should produce identical output when the same plugin instance is reused across transforms (rebuild)', () => {
    const plugin = createDeclarativeAopPlugin(RESILIENCE_MAPPINGS);

    const makeProject = () =>
      createProject({
        '/src/MyService.ts': `
          import { Singleton, Retryable } from './decorators.js'
          @Singleton()
          class MyService {
            @Retryable()
            fetchData() {}
          }
        `,
      });

    const result1 = transformInMemory(
      makeProject(),
      '/out/AppContext.generated.ts',
      [plugin],
      RESILIENCE_LIBRARY_BEANS,
    );
    const result2 = transformInMemory(
      makeProject(),
      '/out/AppContext.generated.ts',
      [plugin],
      RESILIENCE_LIBRARY_BEANS,
    );

    // Strip timestamp comment (first line) since it varies between runs
    const stripTimestamp = (code: string) =>
      code.split('\n').slice(1).join('\n');
    expect(stripTimestamp(result1.code)).toBe(stripTimestamp(result2.code));
  });
});
