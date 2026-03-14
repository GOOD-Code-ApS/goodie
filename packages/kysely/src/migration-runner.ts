import type { Migration as KyselyMigration } from 'kysely';
import { Migrator } from 'kysely';
import type { AbstractMigration } from './abstract-migration.js';
import { getMigrationName } from './decorators/migration.js';
import type { KyselyProvider } from './transaction-manager.js';

/**
 * Runs Kysely migrations at application startup.
 *
 * Auto-wired by the Kysely transformer plugin as an eager singleton
 * with `@OnInit` on `migrate()`. Constructor receives the
 * KyselyProvider and all discovered @Migration instances.
 */
export class MigrationRunner {
  private readonly kyselyProvider: KyselyProvider;
  private readonly migrations: AbstractMigration[];

  constructor(
    kyselyProvider: KyselyProvider,
    ...migrations: AbstractMigration[]
  ) {
    this.kyselyProvider = kyselyProvider;
    this.migrations = migrations;
  }

  async migrate(): Promise<void> {
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
      db: this.kyselyProvider.kysely,
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
