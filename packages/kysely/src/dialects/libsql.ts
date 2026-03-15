import {
  ConditionalOnProperty,
  Config,
  Eager,
  OnDestroy,
  OnInit,
  Singleton,
} from '@goodie-ts/core';
import type { Kysely } from 'kysely';
import { KyselyDatabase } from '../kysely-database.js';

@Singleton()
@Config('datasource')
@ConditionalOnProperty('datasource.dialect', { havingValue: 'libsql' })
export class LibsqlDatasourceConfig {
  dialect = '';
  /** LibSQL/Turso URL (e.g. `libsql://your-db.turso.io`). */
  url = '';
  /** Authentication token for Turso. */
  authToken = '';
}

@Singleton()
@Eager()
@ConditionalOnProperty('datasource.dialect', { havingValue: 'libsql' })
export class LibsqlKyselyDatabase extends KyselyDatabase {
  private _kysely?: Kysely<any>;

  constructor(private readonly config: LibsqlDatasourceConfig) {
    super();
  }

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'LibsqlKyselyDatabase: not initialized. Wait for @OnInit to complete.',
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
      const mod = await importOptional('@libsql/kysely-libsql');
      const { Kysely: KyselyCtor } = await importOptional('kysely');
      this._kysely = new KyselyCtor({
        dialect: new mod.LibsqlDialect({
          url: this.config.url,
          authToken: this.config.authToken || undefined,
        }),
      });
    } catch (err) {
      throw new Error(
        `[LibsqlKyselyDatabase] Failed to initialize: ${err instanceof Error ? err.message : err}\n` +
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
      `LibsqlKyselyDatabase requires '${packageName}' but it is not installed. ` +
        `Install it with your package manager.`,
    );
  }
}
