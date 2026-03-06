import type { IRBeanDefinition } from '@goodie-ts/transformer';
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

/** Simulates the KyselyDatabase library bean that would come from beans.json. */
const kyselyDatabaseLibraryBean: IRBeanDefinition = {
  tokenRef: {
    kind: 'class',
    className: 'KyselyDatabase',
    importPath: '@goodie-ts/kysely',
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
    filePath: '@goodie-ts/kysely',
    line: 0,
    column: 0,
  },
};

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('TransactionalInterceptor');
    expect(result.code).toContain(
      "import { KyselyDatabase, TransactionManager, TransactionalInterceptor } from '@goodie-ts/kysely'",
    );
    expect(result.code).toContain(
      "import { buildInterceptorChain } from '@goodie-ts/core'",
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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

    expect(result.code).toContain('instance.create = buildInterceptorChain');
    expect(result.code).toContain('instance.update = buildInterceptorChain');
  });

  it('should wire TransactionManager with KyselyDatabase dependency from library beans', () => {
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

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

    // TransactionManager factory should receive KyselyDatabase as dep0
    expect(result.code).toContain(
      '(dep0: any) => new TransactionManager(dep0)',
    );
    expect(result.code).toContain('token: KyselyDatabase');
  });

  it('should have zero deps on TransactionManager when KyselyDatabase library bean is absent', () => {
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

    expect(result.code).toContain('() => new TransactionManager()');
  });

  // --- @Migration tests ---

  it('should create synthetic beans for @Migration classes and MigrationRunner', () => {
    const project = createProject({
      '/src/migrations/CreateTodos.ts': `
        import { Migration } from './decorators.js'
        @Migration('001_create_todos')
        export class CreateTodos {
          async up(db: any) {}
          async down(db: any) {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

    // MigrationRunner should appear as a bean
    expect(result.code).toContain('MigrationRunner');
    expect(result.code).toContain(
      "import { KyselyDatabase, MigrationRunner } from '@goodie-ts/kysely'",
    );
    // Migration class should appear as a synthetic bean
    expect(result.code).toContain('token: CreateTodos');
    // MigrationRunner should be eager
    expect(result.code).toContain('eager: true');
    // MigrationRunner should have postConstructMethods metadata
    expect(result.code).toContain('postConstructMethods: ["migrate"]');
  });

  it('should wire MigrationRunner with KyselyDatabase dependency and individual migration deps', () => {
    const project = createProject({
      '/src/migrations/CreateTodos.ts': `
        import { Migration } from './decorators.js'
        @Migration('001_create_todos')
        export class CreateTodos {
          async up(db: any) {}
          async down(db: any) {}
        }
      `,
      '/src/migrations/AddIndex.ts': `
        import { Migration } from './decorators.js'
        @Migration('002_add_index')
        export class AddIndex {
          async up(db: any) {}
          async down(db: any) {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

    // MigrationRunner factory should receive KyselyDatabase + each migration as individual deps
    expect(result.code).toContain(
      '(dep0: any, dep1: any, dep2: any) => new MigrationRunner(dep0, dep1, dep2)',
    );
    // Individual deps per migration class (not collection)
    expect(result.code).toContain(
      '{ token: CreateTodos, optional: false, collection: false }',
    );
    expect(result.code).toContain(
      '{ token: AddIndex, optional: false, collection: false }',
    );
    // Both migration classes should appear as beans
    expect(result.code).toContain('token: CreateTodos');
    expect(result.code).toContain('token: AddIndex');
    // No baseTokens or collection injection
    expect(result.code).not.toContain('baseTokens');
    expect(result.code).not.toContain('AbstractMigration');
  });

  it('should warn and skip MigrationRunner when KyselyDatabase library bean is absent', () => {
    const project = createProject({
      '/src/migrations/CreateTodos.ts': `
        import { Migration } from './decorators.js'
        @Migration('001_create_todos')
        export class CreateTodos {
          async up(db: any) {}
          async down(db: any) {}
        }
      `,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = transformInMemory(project, '/out/AppContext.generated.ts', [
      createKyselyPlugin(),
    ]);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '@Migration classes found but no Kysely provider detected',
      ),
    );
    expect(result.code).not.toContain('MigrationRunner');

    warnSpy.mockRestore();
  });

  it('should not create MigrationRunner when no @Migration classes exist', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton } from './decorators.js'
        @Singleton()
        class MyService {
          async doWork() {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

    expect(result.code).not.toContain('MigrationRunner');
  });

  it('should support @Migration alongside @Transactional in the same project', () => {
    const project = createProject({
      '/src/MyService.ts': `
        import { Singleton, Transactional } from './decorators.js'
        @Singleton()
        class MyService {
          @Transactional()
          async create() {}
        }
      `,
      '/src/migrations/CreateTodos.ts': `
        import { Migration } from './decorators.js'
        @Migration('001_create_todos')
        export class CreateTodos {
          async up(db: any) {}
          async down(db: any) {}
        }
      `,
    });

    const result = transformInMemory(
      project,
      '/out/AppContext.generated.ts',
      [createKyselyPlugin()],
      [kyselyDatabaseLibraryBean],
    );

    // Both features should be present
    expect(result.code).toContain('TransactionalInterceptor');
    expect(result.code).toContain('TransactionManager');
    expect(result.code).toContain('MigrationRunner');
    expect(result.code).toContain('token: CreateTodos');
  });
});
