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
 * - `d1` → `kysely-d1` + `D1Dialect` (per-request — binding resolved via RuntimeBindings)
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
  private _d1Factory?: () => Promise<Kysely<any>>;

  constructor(private readonly config: DatasourceConfig) {}

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'KyselyDatabase: not initialized. ' +
          (this.config.dialect === 'd1'
            ? 'D1 dialect is per-request — use getD1Instance() within a RuntimeBindings.run() scope.'
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
    if (this.config.dialect === 'd1') {
      // D1 is per-request — preload the factory but don't create an instance.
      // Each request gets a fresh Kysely instance via getD1Instance().
      const { default: createDialect } = await import('./dialect-factory.js');
      const { Kysely } = await import('kysely');
      this._d1Factory = async () => {
        const dialect = await createDialect(this.config);
        return new Kysely({ dialect });
      };
      return;
    }

    await this._createKyselyInstance();
  }

  /**
   * Get a per-request Kysely instance for D1 dialect.
   * Must be called within a `RuntimeBindings.run()` scope.
   * Each call creates a new Kysely instance bound to the current request's D1 binding.
   *
   * For non-D1 dialects, returns the shared singleton instance.
   */
  async getD1Instance(): Promise<Kysely<any>> {
    if (this.config.dialect !== 'd1') {
      return this.kysely;
    }
    if (!this._d1Factory) {
      throw new Error(
        'KyselyDatabase: D1 factory not initialized. Ensure @PostConstruct has completed.',
      );
    }
    return this._d1Factory();
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
