import type {
  IRBeanDefinition,
  ResolvedAopMapping,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import {
  _parseDecoratorArgs,
  createDeclarativeAopPlugin,
} from '../src/aop-plugin.js';
import { transformInMemory } from '../src/transform.js';
import { DECORATOR_STUBS } from './helpers.js';

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

// --- Arg parser unit tests ---

describe('parseDecoratorArgs', () => {
  it('should return defaults + static metadata when no args provided', () => {
    const result = _parseDecoratorArgs([], {
      interceptor: 'RetryInterceptor',
      order: -10,
      defaults: { maxAttempts: 3, delay: 1000 },
      metadata: { kind: 'retry' },
    });

    expect(result).toEqual({ maxAttempts: 3, delay: 1000, kind: 'retry' });
  });

  it('should parse an object literal argument', () => {
    const result = _parseDecoratorArgs(
      ['{ maxAttempts: 5, delay: 500, multiplier: 2 }'],
      {
        interceptor: 'RetryInterceptor',
        order: -10,
        defaults: { maxAttempts: 3, delay: 1000, multiplier: 1 },
      },
    );

    expect(result).toEqual({ maxAttempts: 5, delay: 500, multiplier: 2 });
  });

  it('should parse positional args via argMapping', () => {
    const result = _parseDecoratorArgs(["'todos'"], {
      interceptor: 'CacheInterceptor',
      order: -50,
      argMapping: ['cacheName'],
      metadata: { cacheAction: 'get' },
    });

    expect(result).toEqual({ cacheName: 'todos', cacheAction: 'get' });
  });

  it('should parse positional arg followed by object literal', () => {
    const result = _parseDecoratorArgs(["'todos'", '{ ttlMs: 30000 }'], {
      interceptor: 'CacheInterceptor',
      order: -50,
      argMapping: ['cacheName'],
      metadata: { cacheAction: 'get' },
    });

    expect(result).toEqual({
      cacheName: 'todos',
      ttlMs: 30000,
      cacheAction: 'get',
    });
  });

  it('should let static metadata override parsed values', () => {
    const result = _parseDecoratorArgs(
      ["'todos'", '{ cacheAction: "manual" }'],
      {
        interceptor: 'CacheInterceptor',
        order: -50,
        argMapping: ['cacheName'],
        metadata: { cacheAction: 'get' },
      },
    );

    // Static metadata wins
    expect(result.cacheAction).toBe('get');
  });

  it('should parse boolean values', () => {
    const result = _parseDecoratorArgs(['{ logArgs: true }'], {
      interceptor: 'LoggingInterceptor',
      order: -100,
    });

    expect(result).toEqual({ logArgs: true });
  });

  it('should parse string values with single quotes', () => {
    const result = _parseDecoratorArgs(["{ level: 'debug' }"], {
      interceptor: 'LoggingInterceptor',
      order: -100,
    });

    expect(result).toEqual({ level: 'debug' });
  });

  it('should parse numeric values with TypeScript separators', () => {
    const result = _parseDecoratorArgs(['{ delay: 1_000 }'], {
      interceptor: 'RetryInterceptor',
      order: -10,
      defaults: { delay: 500 },
    });

    expect(result).toEqual({ delay: 1000 });
  });

  it('should use defaults for missing args', () => {
    const result = _parseDecoratorArgs(['{ maxAttempts: 5 }'], {
      interceptor: 'RetryInterceptor',
      order: -10,
      defaults: { maxAttempts: 3, delay: 1000, multiplier: 1 },
    });

    expect(result).toEqual({ maxAttempts: 5, delay: 1000, multiplier: 1 });
  });

  it('should handle single numeric positional arg via argMapping', () => {
    const result = _parseDecoratorArgs(['3000'], {
      interceptor: 'TimeoutInterceptor',
      order: -30,
      argMapping: ['duration'],
      defaults: { duration: 5000 },
    });

    expect(result).toEqual({ duration: 3000 });
  });

  it('should handle object literal for @Timeout({ duration: 3000 })', () => {
    const result = _parseDecoratorArgs(['{ duration: 3000 }'], {
      interceptor: 'TimeoutInterceptor',
      order: -30,
      argMapping: ['duration'],
      defaults: { duration: 5000 },
    });

    expect(result).toEqual({ duration: 3000 });
  });

  it('should return only defaults when no args and no static metadata', () => {
    const result = _parseDecoratorArgs([], {
      interceptor: 'TimeoutInterceptor',
      order: -30,
      defaults: { duration: 5000 },
    });

    expect(result).toEqual({ duration: 5000 });
  });
});

// --- Integration tests ---

const LOGGING_MAPPINGS: ResolvedAopMapping[] = [
  {
    decoratorName: 'Log',
    declaration: { interceptor: 'LoggingInterceptor', order: -100 },
    packageName: '@goodie-ts/logging',
  },
];

const LOGGING_LIBRARY_BEANS: IRBeanDefinition[] = [
  {
    tokenRef: {
      kind: 'class',
      className: 'LoggingInterceptor',
      importPath: '@goodie-ts/logging',
    },
    scope: 'singleton',
    eager: false,
    name: undefined,
    constructorDeps: [],
    fieldDeps: [],
    factoryKind: 'constructor',
    providesSource: undefined,
    metadata: {},
    sourceLocation: { filePath: '@goodie-ts/logging', line: 0, column: 0 },
  },
];

describe('Declarative AOP Plugin — Integration', () => {
  it('should wire interceptedMethods for @Log decorated methods', () => {
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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [],
      LOGGING_LIBRARY_BEANS,
      LOGGING_MAPPINGS,
    );

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('LoggingInterceptor');
    expect(result.code).toContain(
      "import { LoggingInterceptor } from '@goodie-ts/logging'",
    );
    // buildInterceptorChain auto-derived in core import
    expect(result.code).toContain('buildInterceptorChain');
  });

  it('should not emit AOP wiring when no decorators match', () => {
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
      LOGGING_LIBRARY_BEANS,
      LOGGING_MAPPINGS,
    );

    // No AOP wiring should happen — LoggingInterceptor bean still appears
    // (from library beans) but no buildInterceptorChain calls
    expect(result.code).not.toContain('buildInterceptorChain');
  });

  it('should clear state between rebuilds (watch mode)', () => {
    const mapping = LOGGING_MAPPINGS;

    const makeProject = () =>
      createProject({
        '/src/MyService.ts': `
          import { Singleton, Log } from './decorators.js'
          @Singleton()
          class MyService {
            @Log()
            doWork() {}
          }
        `,
      });

    // Use the same plugin instance to verify beforeScan clears state
    const plugin = createDeclarativeAopPlugin(mapping);

    const result1 = transformInMemory(
      makeProject(),
      '/out/gen.ts',
      [plugin],
      LOGGING_LIBRARY_BEANS,
    );
    const result2 = transformInMemory(
      makeProject(),
      '/out/gen.ts',
      [plugin],
      LOGGING_LIBRARY_BEANS,
    );

    const stripTimestamp = (code: string) =>
      code.split('\n').slice(1).join('\n');
    expect(stripTimestamp(result1.code)).toBe(stripTimestamp(result2.code));
  });

  it('should handle multiple decorators from different packages on the same method', () => {
    const allMappings: ResolvedAopMapping[] = [
      ...LOGGING_MAPPINGS,
      {
        decoratorName: 'Retryable',
        declaration: {
          interceptor: 'RetryInterceptor',
          order: -10,
          defaults: { maxAttempts: 3, delay: 1000, multiplier: 1 },
        },
        packageName: '@goodie-ts/resilience',
      },
    ];

    const libraryBeans: IRBeanDefinition[] = [
      ...LOGGING_LIBRARY_BEANS,
      {
        tokenRef: {
          kind: 'class',
          className: 'RetryInterceptor',
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
      },
    ];

    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Log, Retryable } from './decorators.js'
        @Singleton()
        class MyService {
          @Log()
          @Retryable()
          doWork() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      libraryBeans,
      allMappings,
    );

    expect(result.code).toContain('LoggingInterceptor');
    expect(result.code).toContain('RetryInterceptor');
    expect(result.code).toContain('buildInterceptorChain');
  });
});
