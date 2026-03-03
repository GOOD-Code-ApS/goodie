import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import { createCachePlugin } from '../src/cache-transformer-plugin.js';

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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('CacheInterceptor');
    expect(result.code).toContain('CacheManager');
    expect(result.code).toContain(
      "import { CacheInterceptor, CacheManager } from '@goodie-ts/cache'",
    );
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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

    expect(result.code).not.toContain('CacheInterceptor');
    expect(result.code).not.toContain('CacheManager');
  });

  it('should generate synthetic CacheManager and CacheInterceptor beans', () => {
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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

    expect(result.code).toContain('"ttlMs":30000');
  });

  it('should not add duplicate synthetic beans when afterResolve is invoked with existing beans', () => {
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

    const result = transformInMemory(project, '/out/gen.ts', [
      createCachePlugin(),
    ]);

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
});
