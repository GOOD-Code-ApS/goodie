import { Eager, OnInit, Singleton } from '@goodie-ts/core';
import type { Migration as KyselyMigration } from 'kysely';
import { Migrator } from 'kysely';
import type { AbstractMigration } from './abstract-migration.js';
import { getMigrationName } from './decorators/migration.js';
import type { KyselyDatabase } from './kysely-database.js';

/**
 * Runs Kysely migrations at application startup.
 *
 * Library bean — eager singleton with `@OnInit migrate()`.
 * Constructor receives `KyselyDatabase` and all `@Migration` instances
 * via collection injection on `AbstractMigration`.
 *
 * Migrations are sorted by their `@Migration('name')` string and executed
 * in lexicographic order via Kysely's `Migrator`.
 */
@Singleton()
@Eager()
export class MigrationRunner {
  constructor(
    private readonly kyselyDatabase: KyselyDatabase,
    private readonly migrations: AbstractMigration[],
  ) {}

  @OnInit()
  async migrate(): Promise<void> {
    if (this.migrations.length === 0) return;

    const migrationMap: Record<string, KyselyMigration> = {};
    for (const m of this.migrations) {
      const name = getMigrationName(m);
      if (!name) {
        throw new Error(
          `MigrationRunner received an object without @Migration metadata: ${m.constructor.name}`,
        );
      }
      // Kysely's Migrator spreads migration objects (...migration), which
      // drops prototype methods from class instances. Bind explicitly.
      migrationMap[name] = {
        up: m.up.bind(m),
        down: m.down?.bind(m),
      };
    }

    const migrator = new Migrator({
      db: this.kyselyDatabase.kysely,
      provider: { getMigrations: async () => migrationMap },
    });

    const { error, results } = await migrator.migrateToLatest();

    for (const r of results ?? []) {
      if (r.status === 'Error') {
        console.error(`Migration "${r.migrationName}" failed`);
      }
    }

    if (error) throw error;
  }
}
