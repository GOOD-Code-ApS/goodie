import { describe, expect, it, vi } from 'vitest';
import { AbstractMigration } from '../src/abstract-migration.js';
import { Migration } from '../src/decorators/migration.js';
import { MigrationRunner } from '../src/migration-runner.js';

// Mock the Migrator class from kysely
vi.mock('kysely', () => ({
  Migrator: vi.fn(),
}));

import { Migrator } from 'kysely';

function createMockKyselyProvider() {
  return { kysely: { __brand: 'mock-kysely' } as any };
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

describe('MigrationRunner', () => {
  it('should call migrateToLatest with all migration instances', async () => {
    const migrateToLatest = vi.fn().mockResolvedValue({ results: [] });
    vi.mocked(Migrator).mockImplementation(() => ({ migrateToLatest }) as any);

    const provider = createMockKyselyProvider();
    const migration1 = createMigrationClass('001_create_users');
    const migration2 = createMigrationClass('002_create_todos');

    const runner = new MigrationRunner(provider as any, [
      migration1,
      migration2,
    ]);
    await runner.migrate();

    expect(Migrator).toHaveBeenCalledWith({
      db: provider.kysely,
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

    const provider = createMockKyselyProvider();
    const migration1 = createMigrationClass('001_create_users');
    const migration2 = createMigrationClass('002_create_todos');

    const runner = new MigrationRunner(provider as any, [
      migration1,
      migration2,
    ]);
    await runner.migrate();

    const migrations = await capturedProvider.getMigrations();
    expect(Object.keys(migrations)).toEqual([
      '001_create_users',
      '002_create_todos',
    ]);
    // Migrations are wrapped with bound methods (Kysely spreads objects, losing prototype methods)
    expect(migrations['001_create_users'].up).toBeTypeOf('function');
    expect(migrations['001_create_users'].down).toBeTypeOf('function');
    expect(migrations['002_create_todos'].up).toBeTypeOf('function');
  });

  it('should throw when Migrator returns an error', async () => {
    const migrationError = new Error('migration failed');
    const migrateToLatest = vi.fn().mockResolvedValue({
      error: migrationError,
      results: [{ migrationName: '001_bad', status: 'Error' }],
    });
    vi.mocked(Migrator).mockImplementation(() => ({ migrateToLatest }) as any);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const provider = createMockKyselyProvider();
    const migration = createMigrationClass('001_bad');
    const runner = new MigrationRunner(provider as any, [migration]);

    await expect(runner.migrate()).rejects.toThrow('migration failed');
    expect(errorSpy).toHaveBeenCalledWith('Migration "001_bad" failed');

    errorSpy.mockRestore();
  });

  it('should throw when a migration instance lacks @Migration metadata', async () => {
    const migrateToLatest = vi.fn().mockResolvedValue({ results: [] });
    vi.mocked(Migrator).mockImplementation(() => ({ migrateToLatest }) as any);

    const provider = createMockKyselyProvider();
    // AbstractMigration subclass without @Migration decorator
    class UndecoratedMigration extends AbstractMigration {
      async up() {}
    }
    const badMigration = new UndecoratedMigration();

    const runner = new MigrationRunner(provider as any, [badMigration]);

    await expect(runner.migrate()).rejects.toThrow(
      'without @Migration metadata',
    );
  });
});
