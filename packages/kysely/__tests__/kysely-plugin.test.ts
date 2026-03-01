import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it, vi } from 'vitest';
import { DECORATOR_STUBS } from '../../transformer/__tests__/helpers.js';
import { createKyselyPlugin } from '../src/kysely-transformer-plugin.js';

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/decorators.ts', DECORATOR_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

describe('Kysely Transformer Plugin', () => {
  it('should add TransactionalInterceptor for @Transactional decorated methods', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional()
          async create() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin(),
    ]);

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('TransactionalInterceptor');
    expect(result.code).toContain(
      "import { TransactionalInterceptor } from '@goodie-ts/kysely'",
    );
    expect(result.code).toContain(
      "import { buildInterceptorChain } from '@goodie-ts/aop'",
    );
  });

  it('should generate REQUIRED propagation metadata by default', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional()
          async create() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin(),
    ]);

    expect(result.code).toContain('"propagation":"REQUIRED"');
  });

  it('should parse REQUIRES_NEW propagation', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional({ propagation: 'REQUIRES_NEW' })
          async create() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin(),
    ]);

    expect(result.code).toContain('"propagation":"REQUIRES_NEW"');
  });

  it('should generate a synthetic TransactionalInterceptor bean with TransactionManager dependency', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional()
          async create() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin(),
    ]);

    // TransactionalInterceptor should appear as a bean
    const lines = result.code.split('\n');
    const beanTokenLines = lines.filter((l) =>
      l.includes('token: TransactionalInterceptor'),
    );
    expect(beanTokenLines.length).toBeGreaterThanOrEqual(2);
  });

  it('should not add interceptor when no @Transactional decorators are present', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {
          async doWork() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin(),
    ]);

    expect(result.code).not.toContain('TransactionalInterceptor');
    expect(result.code).not.toContain('buildInterceptorChain');
  });

  it('should handle multiple @Transactional methods on the same class', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional()
          async create() {}
          @Transactional({ propagation: 'REQUIRES_NEW' })
          async update() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin(),
    ]);

    expect(result.code).toContain('instance.create = buildInterceptorChain');
    expect(result.code).toContain('instance.update = buildInterceptorChain');
  });

  it('should add database bean as TransactionManager constructor dep when database option is set', () => {
    const project = createProject({
      '/src/Database.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        export class Database {
          kysely: any
        }
      `,
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional()
          async create() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin({ database: 'Database' }),
    ]);

    // TransactionManager factory should receive a dep (dep0 = Database)
    expect(result.code).toContain(
      '(dep0: any) => new TransactionManager(dep0)',
    );
    // Database should be listed as a dependency of TransactionManager
    expect(result.code).toContain('token: Database');
  });

  it('should have zero constructor deps for TransactionManager when no database option is set', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional()
          async create() {}
        }
      `,
    });

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin(),
    ]);

    // TransactionManager factory should have no deps
    expect(result.code).toContain('() => new TransactionManager()');
  });

  it('should warn and fall back to zero deps when database class is not found', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional()
          async create() {}
        }
      `,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin({ database: 'NonExistentDb' }),
    ]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("'NonExistentDb' not found"),
    );
    // Falls back to zero-arg constructor
    expect(result.code).toContain('() => new TransactionManager()');

    warnSpy.mockRestore();
  });
});
