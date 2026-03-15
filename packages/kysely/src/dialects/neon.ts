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
@ConditionalOnProperty('datasource.dialect', { havingValue: 'neon' })
export class NeonDatasourceConfig {
  dialect = '';
  /** Neon connection string (e.g. `postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/mydb`). */
  url = '';
}

@Singleton()
@Eager()
@ConditionalOnProperty('datasource.dialect', { havingValue: 'neon' })
export class NeonKyselyDatabase extends KyselyDatabase {
  private _kysely?: Kysely<any>;

  constructor(private readonly config: NeonDatasourceConfig) {
    super();
  }

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'NeonKyselyDatabase: not initialized. Wait for @OnInit to complete.',
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
      const mod = await importOptional('kysely-neon');
      const { Kysely: KyselyCtor } = await importOptional('kysely');
      this._kysely = new KyselyCtor({
        dialect: new mod.NeonDialect({
          connectionString: this.config.url,
        }),
      });
    } catch (err) {
      throw new Error(
        `[NeonKyselyDatabase] Failed to initialize: ${err instanceof Error ? err.message : err}\n` +
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
      `NeonKyselyDatabase requires '${packageName}' but it is not installed. ` +
        `Install it with your package manager.`,
    );
  }
}
