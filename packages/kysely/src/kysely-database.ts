import { PostConstruct, PreDestroy, Singleton } from '@goodie-ts/core';
import type { Kysely } from 'kysely';
import type { DatasourceConfig } from './datasource-config.js';
import type { Dialect } from './dialect.js';

/**
 * Library-provided Kysely database singleton.
 *
 * Creates and manages a `Kysely<DB>` instance based on `DatasourceConfig`.
 * Automatically selects the correct dialect driver via dynamic import:
 * - `postgres` → `pg` + `PostgresDialect`
 * - `mysql` → `mysql2` + `MysqlDialect`
 * - `sqlite` → `better-sqlite3` + `SqliteDialect`
 *
 * Generic parameter `DB` defaults to `any` in the library. Users bridge
 * to their schema type via a thin `@Module`:
 * ```typescript
 * @Module()
 * class DatabaseModule {
 *   constructor(private db: KyselyDatabase) {}
 *
 *   @Provides()
 *   typedDb(): KyselyDatabase<DB> {
 *     return this.db as KyselyDatabase<DB>;
 *   }
 * }
 * ```
 *
 * Repositories then inject `KyselyDatabase<DB>` for fully typed,
 * transaction-aware access via the `.kysely` property.
 */
@Singleton()
export class KyselyDatabase {
  kysely!: Kysely<any>;

  constructor(private readonly config: DatasourceConfig) {}

  get dialect(): Dialect {
    return this.config.dialect as Dialect;
  }

  @PostConstruct()
  async init() {
    const { default: createDialect } = await import('./dialect-factory.js');
    const kyselyDialect = await createDialect(this.config);
    const { Kysely } = await import('kysely');
    this.kysely = new Kysely({ dialect: kyselyDialect });
  }

  @PreDestroy()
  async destroy() {
    await this.kysely.destroy();
  }
}
