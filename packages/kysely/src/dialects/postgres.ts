import {
  ConditionalOnProperty,
  Config,
  OnDestroy,
  OnInit,
  Singleton,
} from '@goodie-ts/core';
import type { Kysely } from 'kysely';
import { KyselyDatabase } from '../kysely-database.js';
import type { PoolConfig } from '../pool-config.js';

/**
 * PostgreSQL datasource configuration, bound from `datasource.*` keys.
 *
 * Common fields are typed; additional driver-specific options can be
 * added to the config JSON and will be available in future versions.
 */
@Singleton()
@Config('datasource')
@ConditionalOnProperty('datasource.dialect', { havingValue: 'postgres' })
export class PostgresDatasourceConfig {
  dialect = '';
  /** Connection string (e.g. `postgres://user:pass@localhost:5432/mydb`). */
  url = '';
  host = '';
  port = 5432;
  database = '';
  user = '';
  password = '';
}

@Singleton()
@ConditionalOnProperty('datasource.dialect', { havingValue: 'postgres' })
export class PostgresKyselyDatabase extends KyselyDatabase {
  private _kysely?: Kysely<any>;

  constructor(
    private readonly config: PostgresDatasourceConfig,
    private readonly pool: PoolConfig,
  ) {
    super();
  }

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'PostgresKyselyDatabase: not initialized. Wait for @OnInit to complete.',
      );
    }
    return this._kysely;
  }

  get supportsReturning(): boolean {
    return true;
  }

  @OnInit()
  async init() {
    try {
      const { Pool } = await importOptional('pg');
      const { Kysely: KyselyCtor, PostgresDialect } =
        await importOptional('kysely');
      this._kysely = new KyselyCtor({
        dialect: new PostgresDialect({
          pool: new Pool({
            connectionString: this.config.url || undefined,
            host: this.config.host || undefined,
            port: this.config.port,
            database: this.config.database || undefined,
            user: this.config.user || undefined,
            password: this.config.password || undefined,
            min: this.pool.min,
            max: this.pool.max,
          }),
        }),
      });
    } catch (err) {
      throw new Error(
        `[PostgresKyselyDatabase] Failed to initialize: ${err instanceof Error ? err.message : err}\n` +
          `  Review your 'datasource.*' configuration.`,
      );
    }
  }

  @OnDestroy()
  async destroy() {
    await this._kysely?.destroy();
  }
}

async function importOptional(packageName: string): Promise<any> {
  try {
    return await import(packageName);
  } catch {
    throw new Error(
      `PostgresKyselyDatabase requires '${packageName}' but it is not installed. ` +
        `Install it with your package manager.`,
    );
  }
}
