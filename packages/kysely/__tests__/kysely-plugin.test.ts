import type { IRComponentDefinition } from '@goodie-ts/transformer';
import { transformInMemory } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
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
const kyselyDatabaseLibraryBean: IRComponentDefinition = {
  tokenRef: {
    kind: 'class',
    className: 'KyselyDatabase',
    importPath: '@goodie-ts/kysely',
  },
  scope: 'singleton',
  eager: false,
  name: undefined,
  primary: false,
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

/** Simulates the TransactionManager library bean from beans.json. */
const transactionManagerLibraryBean: IRComponentDefinition = {
  tokenRef: {
    kind: 'class',
    className: 'TransactionManager',
    importPath: '@goodie-ts/kysely',
  },
  scope: 'singleton',
  eager: false,
  name: undefined,
  primary: false,
  constructorDeps: [
    {
      tokenRef: {
        kind: 'class',
        className: 'KyselyDatabase',
        importPath: '@goodie-ts/kysely',
      },
      optional: true,
      collection: false,
      sourceLocation: { filePath: '@goodie-ts/kysely', line: 0, column: 0 },
    },
  ],
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

/** Simulates the TransactionalInterceptor library bean from beans.json. */
const transactionalInterceptorLibraryBean: IRComponentDefinition = {
  tokenRef: {
    kind: 'class',
    className: 'TransactionalInterceptor',
    importPath: '@goodie-ts/kysely',
  },
  scope: 'singleton',
  eager: false,
  name: undefined,
  primary: false,
  constructorDeps: [
    {
      tokenRef: {
        kind: 'class',
        className: 'TransactionManager',
        importPath: '@goodie-ts/kysely',
      },
      optional: false,
      collection: false,
      sourceLocation: { filePath: '@goodie-ts/kysely', line: 0, column: 0 },
    },
  ],
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

/** Simulates the MigrationRunner library bean from beans.json. */
const migrationRunnerLibraryBean: IRComponentDefinition = {
  tokenRef: {
    kind: 'class',
    className: 'MigrationRunner',
    importPath: '@goodie-ts/kysely',
  },
  scope: 'singleton',
  eager: true,
  name: undefined,
  primary: false,
  constructorDeps: [
    {
      tokenRef: {
        kind: 'class',
        className: 'KyselyDatabase',
        importPath: '@goodie-ts/kysely',
      },
      optional: false,
      collection: false,
      sourceLocation: { filePath: '@goodie-ts/kysely', line: 0, column: 0 },
    },
    {
      tokenRef: {
        kind: 'class',
        className: 'AbstractMigration',
        importPath: '@goodie-ts/kysely',
      },
      optional: false,
      collection: true,
      sourceLocation: { filePath: '@goodie-ts/kysely', line: 0, column: 0 },
    },
  ],
  fieldDeps: [],
  factoryKind: 'constructor',
  providesSource: undefined,
  metadata: { onInitMethods: ['migrate'] },
  sourceLocation: {
    filePath: '@goodie-ts/kysely',
    line: 0,
    column: 0,
  },
};

/** All kysely library beans. */
const allKyselyLibraryBeans: IRComponentDefinition[] = [
  kyselyDatabaseLibraryBean,
  transactionManagerLibraryBean,
  transactionalInterceptorLibraryBean,
  migrationRunnerLibraryBean,
];

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
      allKyselyLibraryBeans,
    );

    expect(result.code).toContain('buildInterceptorChain');
    expect(result.code).toContain('TransactionalInterceptor');
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
      allKyselyLibraryBeans,
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
      allKyselyLibraryBeans,
    );

    expect(result.code).toContain('"propagation":"REQUIRES_NEW"');
  });

  it('should include TransactionalInterceptor and TransactionManager from library beans', () => {
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
      allKyselyLibraryBeans,
    );

    // Library beans should appear in the generated code
    expect(result.code).toContain('token: TransactionalInterceptor');
    expect(result.code).toContain('token: TransactionManager');
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
      allKyselyLibraryBeans,
    );

    // No buildInterceptorChain since no @Transactional
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
      allKyselyLibraryBeans,
    );

    expect(result.code).toContain('instance.create = buildInterceptorChain');
    expect(result.code).toContain('instance.update = buildInterceptorChain');
  });

  // --- @Migration tests ---

  it('should register @Migration classes as beans via ctx.registerBean()', () => {
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
      allKyselyLibraryBeans,
    );

    // Migration class should appear as a scanned bean (not synthetic)
    expect(result.code).toContain('token: CreateTodos');
    // MigrationRunner from library beans should be present
    expect(result.code).toContain('token: MigrationRunner');
    expect(result.code).toContain('eager: true');
  });

  it('should not create MigrationRunner when no @Migration classes exist but library bean is present', () => {
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
      allKyselyLibraryBeans,
    );

    // MigrationRunner is still present as a library bean — it just has an empty migration list
    expect(result.code).toContain('token: MigrationRunner');
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
      allKyselyLibraryBeans,
    );

    // Both features should be present
    expect(result.code).toContain('TransactionalInterceptor');
    expect(result.code).toContain('TransactionManager');
    expect(result.code).toContain('MigrationRunner');
    expect(result.code).toContain('token: CreateTodos');
  });
});
