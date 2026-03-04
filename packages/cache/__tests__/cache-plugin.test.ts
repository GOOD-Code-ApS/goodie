import type {
  IRBeanDefinition,
  ResolvedAopMapping,
} from '@goodie-ts/transformer';
import {
  createDeclarativeAopPlugin,
  transformInMemory,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';

const CACHE_MAPPINGS: ResolvedAopMapping[] = [
  {
    decoratorName: 'Cacheable',
    declaration: {
      interceptor: 'CacheInterceptor',
      order: -50,
      metadata: { cacheAction: 'get' },
      argMapping: ['cacheName'],
    },
    packageName: '@goodie-ts/cache',
  },
  {
    decoratorName: 'CacheEvict',
    declaration: {
      interceptor: 'CacheInterceptor',
      order: -50,
      metadata: { cacheAction: 'evict' },
      argMapping: ['cacheName'],
    },
    packageName: '@goodie-ts/cache',
  },
  {
    decoratorName: 'CachePut',
    declaration: {
      interceptor: 'CacheInterceptor',
      order: -50,
      metadata: { cacheAction: 'put' },
      argMapping: ['cacheName'],
    },
    packageName: '@goodie-ts/cache',
  },
];

const CACHE_LIBRARY_BEANS: IRBeanDefinition[] = [
  {
    tokenRef: {
      kind: 'class',
      className: 'CacheManager',
      importPath: '@goodie-ts/cache',
    },
    scope: 'singleton',
    eager: false,
    name: undefined,
    constructorDeps: [],
    fieldDeps: [],
    factoryKind: 'constructor',
    providesSource: undefined,
    metadata: {},
    sourceLocation: { filePath: '@goodie-ts/cache', line: 0, column: 0 },
  },
  {
    tokenRef: {
      kind: 'class',
      className: 'CacheInterceptor',
      importPath: '@goodie-ts/cache',
    },
    scope: 'singleton',
    eager: false,
    name: undefined,
    constructorDeps: [
      {
        tokenRef: {
          kind: 'class',
          className: 'CacheManager',
          importPath: '@goodie-ts/cache',
        },
        optional: false,
        collection: false,
        sourceLocation: {
          filePath: '@goodie-ts/cache',
          line: 0,
          column: 0,
        },
      },
    ],
    fieldDeps: [],
    factoryKind: 'constructor',
    providesSource: undefined,
    metadata: {},
    sourceLocation: { filePath: '@goodie-ts/cache', line: 0, column: 0 },
  },
];

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

describe('Cache Transformer Plugin', () => {
  it('should add CacheInterceptor for @Cacheable methods', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, Cacheable } from './decorators.js'
        @Singleton()
        class TodoService {
          @Cacheable('todos')
          findAll() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('CacheInterceptor');
    expect(result.code).toContain('CacheManager');
    expect(result.code).toContain("from '@goodie-ts/cache'");
  });

  it('should generate metadata with cacheName and cacheAction', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, Cacheable } from './decorators.js'
        @Singleton()
        class TodoService {
          @Cacheable('todos')
          findAll() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    expect(result.code).toContain('"cacheName":"todos"');
    expect(result.code).toContain('"cacheAction":"get"');
  });

  it('should handle @CacheEvict', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, CacheEvict } from './decorators.js'
        @Singleton()
        class TodoService {
          @CacheEvict('todos')
          create() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    expect(result.code).toContain('"cacheAction":"evict"');
  });

  it('should handle @CachePut', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, CachePut } from './decorators.js'
        @Singleton()
        class TodoService {
          @CachePut('todos')
          update() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    expect(result.code).toContain('"cacheAction":"put"');
  });

  it('should not add interceptor when no cache decorators present', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class TodoService {
          findAll() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    expect(result.code).not.toContain('buildInterceptorChain');
  });

  it('should have CacheManager and CacheInterceptor beans from library beans', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, Cacheable } from './decorators.js'
        @Singleton()
        class TodoService {
          @Cacheable('todos')
          findAll() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    // CacheManager and CacheInterceptor should both be bean tokens
    expect(result.code).toContain('token: CacheManager');
    expect(result.code).toContain('token: CacheInterceptor');
  });

  it('should handle multiple cache decorators on different methods', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, Cacheable, CacheEvict } from './decorators.js'
        @Singleton()
        class TodoService {
          @Cacheable('todos')
          findAll() {}
          @CacheEvict('todos')
          create() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    expect(result.code).toContain('instance.findAll = buildInterceptorChain');
    expect(result.code).toContain('instance.create = buildInterceptorChain');
  });

  it('should pass allEntries metadata for @CacheEvict({ allEntries: true })', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, CacheEvict } from './decorators.js'
        @Singleton()
        class TodoService {
          @CacheEvict('todos', { allEntries: true })
          clearAll() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    expect(result.code).toContain('"cacheAction":"evict"');
    expect(result.code).toContain('"allEntries":true');
  });

  it('should parse ttlMs option for @Cacheable', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, Cacheable } from './decorators.js'
        @Singleton()
        class TodoService {
          @Cacheable('todos', { ttlMs: 30000 })
          findAll() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    expect(result.code).toContain('"ttlMs":30000');
  });

  it('should not add duplicate bean definitions', () => {
    const project = createProject({
      '/src/TodoService.ts': `
        import { Singleton, Cacheable } from './decorators.js'
        @Singleton()
        class TodoService {
          @Cacheable('todos')
          findAll() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/gen.ts',
      [],
      CACHE_LIBRARY_BEANS,
      CACHE_MAPPINGS,
    );

    // Match bean definitions (token + scope line), not dependency references
    const interceptorBeanDefs = result.code.match(
      /token: CacheInterceptor,\n\s+scope:/g,
    );
    expect(interceptorBeanDefs).toHaveLength(1);

    const managerBeanDefs = result.code.match(
      /token: CacheManager,\n\s+scope:/g,
    );
    expect(managerBeanDefs).toHaveLength(1);
  });

  it('should produce identical output when the same plugin instance is reused across transforms (rebuild)', () => {
    const plugin = createDeclarativeAopPlugin(CACHE_MAPPINGS);

    const makeProject = () =>
      createProject({
        '/src/TodoService.ts': `
          import { Singleton, Cacheable } from './decorators.js'
          @Singleton()
          class TodoService {
            @Cacheable('todos')
            findAll() {}
          }
        `,
      });

    const result1 = transformInMemory(
      makeProject(),
      '/out/gen.ts',
      [plugin],
      CACHE_LIBRARY_BEANS,
    );
    const result2 = transformInMemory(
      makeProject(),
      '/out/gen.ts',
      [plugin],
      CACHE_LIBRARY_BEANS,
    );

    // Strip timestamp comment (first line) since it varies between runs
    const stripTimestamp = (code: string) =>
      code.split('\n').slice(1).join('\n');
    expect(stripTimestamp(result1.code)).toBe(stripTimestamp(result2.code));
  });
});
