import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbstractMigration } from '../src/abstract-migration.js';
import { Migration } from '../src/decorators/migration.js';
import { KyselyDatabase } from '../src/kysely-database.js';
import { MigrationPostProcessor } from '../src/migration-post-processor.js';

// Mock the Migrator class from kysely
vi.mock('kysely', () => ({
  Migrator: vi.fn(),
}));

import { Migrator } from 'kysely';

/** Create a mock KyselyDatabase instance. */
function createMockKyselyDatabase() {
  const mock = Object.create(KyselyDatabase.prototype);
  mock.kysely = { __brand: 'mock-kysely' } as any;
  return mock as KyselyDatabase;
}

/** Create a mock ApplicationContext with getAll returning the given migrations. */
function createMockContext(migrations: AbstractMigration[]) {
  return { getAll: vi.fn().mockReturnValue(migrations) } as any;
}

/** Create a migration class extending AbstractMigration with @Migration decorator applied. */
function createMigrationClass(name: string) {
  @Migration(name)
  class TestMigration extends AbstractMigration {
    async up(_db: any) {}
    async down(_db: any) {}
  }
  return new TestMigration();
}

const dummyDef = {} as any;

describe('MigrationPostProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run migrations when KyselyDatabase is initialized', async () => {
    const migrateToLatest = vi.fn().mockResolvedValue({ results: [] });
    vi.mocked(Migrator).mockImplementation(() => ({ migrateToLatest }) as any);

    const db = createMockKyselyDatabase();
    const migration1 = createMigrationClass('001_create_users');
    const migration2 = createMigrationClass('002_create_todos');
    const ctx = createMockContext([migration1, migration2]);

    const processor = new MigrationPostProcessor(ctx);
    const result = await processor.afterInit(db, dummyDef);

    expect(result).toBe(db);
    expect(ctx.getAll).toHaveBeenCalledWith(AbstractMigration);
    expect(Migrator).toHaveBeenCalledWith({
      db: db.kysely,
      provider: { getMigrations: expect.any(Function) },
    });
    expect(migrateToLatest).toHaveBeenCalled();
  });

  it('should build migration map from @Migration static property', async () => {
    let capturedProvider: any;
    const migrateToLatest = vi.fn().mockResolvedValue({ results: [] });
    vi.mocked(Migrator).mockImplementation((opts: any) => {
      capturedProvider = opts.provider;
      return { migrateToLatest } as any;
    });

    const db = createMockKyselyDatabase();
    const migration1 = createMigrationClass('001_create_users');
    const migration2 = createMigrationClass('002_create_todos');
    const ctx = createMockContext([migration1, migration2]);

    const processor = new MigrationPostProcessor(ctx);
    await processor.afterInit(db, dummyDef);

    const migrations = await capturedProvider.getMigrations();
    expect(Object.keys(migrations)).toEqual([
      '001_create_users',
      '002_create_todos',
    ]);
    expect(migrations['001_create_users'].up).toBeTypeOf('function');
    expect(migrations['001_create_users'].down).toBeTypeOf('function');
    expect(migrations['002_create_todos'].up).toBeTypeOf('function');
  });

  it('should skip non-KyselyDatabase components', async () => {
    const ctx = createMockContext([]);
    const processor = new MigrationPostProcessor(ctx);

    const component = { notADatabase: true };
    const result = await processor.afterInit(component, dummyDef);

    expect(result).toBe(component);
    expect(ctx.getAll).not.toHaveBeenCalled();
  });

  it('should skip when no migrations are registered', async () => {
    const db = createMockKyselyDatabase();
    const ctx = createMockContext([]);

    const processor = new MigrationPostProcessor(ctx);
    const result = await processor.afterInit(db, dummyDef);

    expect(result).toBe(db);
    expect(Migrator).not.toHaveBeenCalled();
  });

  it('should throw when Migrator returns an error', async () => {
    const migrationError = new Error('migration failed');
    const migrateToLatest = vi.fn().mockResolvedValue({
      error: migrationError,
      results: [{ migrationName: '001_bad', status: 'Error' }],
    });
    vi.mocked(Migrator).mockImplementation(() => ({ migrateToLatest }) as any);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const db = createMockKyselyDatabase();
    const migration = createMigrationClass('001_bad');
    const ctx = createMockContext([migration]);

    const processor = new MigrationPostProcessor(ctx);

    await expect(processor.afterInit(db, dummyDef)).rejects.toThrow(
      'migration failed',
    );
    expect(errorSpy).toHaveBeenCalledWith('Migration "001_bad" failed');

    errorSpy.mockRestore();
  });

  it('should throw when a migration instance lacks @Migration metadata', async () => {
    class UndecoratedMigration extends AbstractMigration {
      async up() {}
    }
    const badMigration = new UndecoratedMigration();

    const db = createMockKyselyDatabase();
    const ctx = createMockContext([badMigration]);

    const processor = new MigrationPostProcessor(ctx);

    await expect(processor.afterInit(db, dummyDef)).rejects.toThrow(
      'without @Migration metadata',
    );
  });
});
