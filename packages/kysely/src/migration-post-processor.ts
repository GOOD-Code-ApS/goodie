import {
  type ApplicationContext,
  type ComponentDefinition,
  type ComponentPostProcessor,
  PostProcessor,
  Singleton,
} from '@goodie-ts/core';
import type { Migration as KyselyMigration } from 'kysely';
import { Migrator } from 'kysely';
import { AbstractMigration } from './abstract-migration.js';
import { getMigrationName } from './decorators/migration.js';
import { KyselyDatabase } from './kysely-database.js';

/**
 * Runs Kysely migrations when `KyselyDatabase` is initialized.
 *
 * Replaces the previous `MigrationRunner` eager singleton. As a
 * `ComponentPostProcessor`, migrations execute during `KyselyDatabase`
 * initialization — guaranteeing every consumer receives a fully-migrated
 * database instance. Follows Micronaut's `BeanCreatedEventListener<DataSource>`
 * pattern.
 */
@PostProcessor()
@Singleton()
export class MigrationPostProcessor implements ComponentPostProcessor {
  private migrationPromise: Promise<void> | null = null;

  constructor(private readonly ctx: ApplicationContext) {}

  afterInit<T>(
    component: T,
    _definition: ComponentDefinition<T>,
  ): T | Promise<T> {
    if (!(component instanceof KyselyDatabase)) return component;
    if (this.migrationPromise) {
      return this.migrationPromise.then(() => component) as Promise<T>;
    }
    return this.runMigrations(component) as Promise<T>;
  }

  private runMigrations(db: KyselyDatabase): Promise<KyselyDatabase> {
    this.migrationPromise = this.doMigrate(db).catch((err) => {
      // Clear so the next request retries — migrateToLatest() is idempotent.
      this.migrationPromise = null;
      throw err;
    });
    return this.migrationPromise.then(() => db);
  }

  private async doMigrate(db: KyselyDatabase): Promise<void> {
    const migrations = this.ctx.getAll(AbstractMigration);
    if (migrations.length === 0) return;

    const migrationMap: Record<string, KyselyMigration> = {};
    for (const m of migrations) {
      const name = getMigrationName(m);
      if (!name) {
        throw new Error(
          `MigrationPostProcessor received an object without @Migration metadata: ${m.constructor.name}`,
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
      db: db.kysely,
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
