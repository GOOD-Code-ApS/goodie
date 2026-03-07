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
 * - `neon` → `kysely-neon` + `NeonDialect`
 * - `planetscale` → `kysely-planetscale` + `PlanetScaleDialect`
 * - `d1` → `kysely-d1` + `D1Dialect` (deferred init — binding available at request time)
 * - `libsql` → `@libsql/kysely-libsql` + `LibsqlDialect`
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
  private _kysely?: Kysely<any>;
  private _initPromise?: Promise<void>;

  constructor(private readonly config: DatasourceConfig) {}

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'KyselyDatabase: not initialized. ' +
          (this.config.dialect === 'd1'
            ? 'D1 dialect requires a request context — call ensureInitialized() first.'
            : 'Wait for @PostConstruct init() to complete.'),
      );
    }
    return this._kysely;
  }

  get dialect(): Dialect {
    return this.config.dialect as Dialect;
  }

  @PostConstruct()
  async init() {
    // D1 dialect defers initialization — the D1 binding is only available
    // at request time via RuntimeBindings, not at startup.
    if (this.config.dialect === 'd1') return;

    await this._createKyselyInstance();
  }

  /**
   * Ensure the Kysely instance is created. For most dialects this is a no-op
   * (already initialized by @PostConstruct). For D1, this creates the instance
   * on first call using the D1 binding from the current request context.
   */
  async ensureInitialized(): Promise<void> {
    if (this._kysely) return;
    if (this._initPromise) {
      await this._initPromise;
      return;
    }
    this._initPromise = this._createKyselyInstance();
    await this._initPromise;
  }

  @PreDestroy()
  async destroy() {
    await this._kysely?.destroy();
  }

  private async _createKyselyInstance(): Promise<void> {
    const { default: createDialect } = await import('./dialect-factory.js');
    const kyselyDialect = await createDialect(this.config);
    const { Kysely } = await import('kysely');
    this._kysely = new Kysely({ dialect: kyselyDialect });
  }
}
