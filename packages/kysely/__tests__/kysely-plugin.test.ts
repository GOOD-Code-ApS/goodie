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

/** Simulates the KyselyDatabase library component that would come from components.json. */
const kyselyDatabaseLibraryComponent: IRComponentDefinition = {
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

/** Simulates the TransactionManager library component from components.json. */
const transactionManagerLibraryComponent: IRComponentDefinition = {
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

/** Simulates the TransactionalInterceptor library component from components.json. */
const transactionalInterceptorLibraryComponent: IRComponentDefinition = {
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

/** Simulates the MigrationPostProcessor library component from components.json. */
const migrationPostProcessorLibraryComponent: IRComponentDefinition = {
  tokenRef: {
    kind: 'class',
    className: 'MigrationPostProcessor',
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
        className: 'ApplicationContext',
        importPath: '@goodie-ts/core',
      },
      optional: false,
      collection: false,
      sourceLocation: { filePath: '@goodie-ts/kysely', line: 0, column: 0 },
    },
  ],
  fieldDeps: [],
  factoryKind: 'constructor',
  providesSource: undefined,
  metadata: { isComponentPostProcessor: true },
  sourceLocation: {
    filePath: '@goodie-ts/kysely',
    line: 0,
    column: 0,
  },
};

/** All kysely library components. */
const allKyselyLibraryComponents: IRComponentDefinition[] = [
  kyselyDatabaseLibraryComponent,
  transactionManagerLibraryComponent,
  transactionalInterceptorLibraryComponent,
  migrationPostProcessorLibraryComponent,
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
      allKyselyLibraryComponents,
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
      allKyselyLibraryComponents,
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
      allKyselyLibraryComponents,
    );

    expect(result.code).toContain('"propagation":"REQUIRES_NEW"');
  });

  it('should include TransactionalInterceptor and TransactionManager from library components', () => {
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
      allKyselyLibraryComponents,
    );

    // Library components should appear in the generated code
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
      allKyselyLibraryComponents,
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
      allKyselyLibraryComponents,
    );

    expect(result.code).toContain('instance.create = buildInterceptorChain');
    expect(result.code).toContain('instance.update = buildInterceptorChain');
  });

  // --- @Migration tests ---

  it('should register @Migration classes as components via ctx.registerComponent()', () => {
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
      allKyselyLibraryComponents,
    );

    // Migration class should appear as a scanned component (not synthetic)
    expect(result.code).toContain('token: CreateTodos');
    // MigrationPostProcessor from library components should be present
    expect(result.code).toContain('token: MigrationPostProcessor');
  });

  it('should include MigrationPostProcessor when no @Migration classes exist', () => {
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
      allKyselyLibraryComponents,
    );

    // MigrationPostProcessor is present as a library component — afterInit is a no-op with no migrations
    expect(result.code).toContain('token: MigrationPostProcessor');
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
      allKyselyLibraryComponents,
    );

    // Both features should be present
    expect(result.code).toContain('TransactionalInterceptor');
    expect(result.code).toContain('TransactionManager');
    expect(result.code).toContain('MigrationPostProcessor');
    expect(result.code).toContain('token: CreateTodos');
  });
});
