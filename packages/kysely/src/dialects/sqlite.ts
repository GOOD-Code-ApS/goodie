import {
  ConditionalOnProperty,
  Config,
  OnDestroy,
  OnInit,
  Singleton,
} from '@goodie-ts/core';
import type { Kysely } from 'kysely';
import { KyselyDatabase } from '../kysely-database.js';

@Singleton()
@Config('datasource')
@ConditionalOnProperty('datasource.dialect', { havingValue: 'sqlite' })
export class SqliteDatasourceConfig {
  dialect = '';
  /** File path to the SQLite database (e.g. `./data/app.db`). */
  url = '';
}

@Singleton()
@ConditionalOnProperty('datasource.dialect', { havingValue: 'sqlite' })
export class SqliteKyselyDatabase extends KyselyDatabase {
  private _kysely?: Kysely<any>;

  constructor(private readonly config: SqliteDatasourceConfig) {
    super();
  }

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'SqliteKyselyDatabase: not initialized. Wait for @OnInit to complete.',
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
      const BetterSqlite3 = await importOptional('better-sqlite3');
      const { Kysely: KyselyCtor, SqliteDialect } =
        await importOptional('kysely');
      this._kysely = new KyselyCtor({
        dialect: new SqliteDialect({
          database: new BetterSqlite3.default(this.config.url),
        }),
      });
    } catch (err) {
      throw new Error(
        `[SqliteKyselyDatabase] Failed to initialize: ${err instanceof Error ? err.message : err}\n` +
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
      `SqliteKyselyDatabase requires '${packageName}' but it is not installed. ` +
        `Install it with your package manager.`,
    );
  }
}
