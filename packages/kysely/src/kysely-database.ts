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
 * Non-generic (`Kysely<any>`) by design. Users bridge to their schema
 * type via a `@Module` with `@Provides`:
 * ```typescript
 * @Module()
 * class DatabaseModule {
 *   constructor(private db: KyselyDatabase) {}
 *
 *   @Provides()
 *   typedKysely(): Kysely<DB> {
 *     return this.db.kysely as Kysely<DB>;
 *   }
 * }
 * ```
 *
 * Repositories then inject `Kysely<DB>` for fully typed access.
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
    await this.kysely?.destroy();
  }
}
