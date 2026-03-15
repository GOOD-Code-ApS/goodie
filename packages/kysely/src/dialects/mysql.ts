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

@Singleton()
@Config('datasource')
@ConditionalOnProperty('datasource.dialect', { havingValue: 'mysql' })
export class MysqlDatasourceConfig {
  dialect = '';
  /** Connection URI (e.g. `mysql://user:pass@localhost:3306/mydb`). */
  url = '';
  host = '';
  port = 3306;
  database = '';
  user = '';
  password = '';
}

@Singleton()
@ConditionalOnProperty('datasource.dialect', { havingValue: 'mysql' })
export class MysqlKyselyDatabase extends KyselyDatabase {
  private _kysely?: Kysely<any>;

  constructor(
    private readonly config: MysqlDatasourceConfig,
    private readonly pool: PoolConfig,
  ) {
    super();
  }

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'MysqlKyselyDatabase: not initialized. Wait for @OnInit to complete.',
      );
    }
    return this._kysely;
  }

  get supportsReturning(): boolean {
    return false;
  }

  @OnInit()
  async init() {
    try {
      const mysql2 = await importOptional('mysql2/promise');
      const { Kysely: KyselyCtor, MysqlDialect } =
        await importOptional('kysely');
      this._kysely = new KyselyCtor({
        dialect: new MysqlDialect({
          pool: mysql2.createPool({
            uri: this.config.url || undefined,
            host: this.config.host || undefined,
            port: this.config.port,
            database: this.config.database || undefined,
            user: this.config.user || undefined,
            password: this.config.password || undefined,
            connectionLimit: this.pool.max,
          }),
        }),
      });
    } catch (err) {
      throw new Error(
        `[MysqlKyselyDatabase] Failed to initialize: ${err instanceof Error ? err.message : err}\n` +
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
      `MysqlKyselyDatabase requires '${packageName}' but it is not installed. ` +
        `Install it with your package manager.`,
    );
  }
}
