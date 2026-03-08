import {
  ConditionalOnProperty,
  ConfigurationProperties,
  PostConstruct,
  RequestScoped,
  RequestScopeManager,
  Singleton,
} from '@goodie-ts/core';
import type { Kysely } from 'kysely';
import { KyselyDatabase } from '../kysely-database.js';

@Singleton()
@ConfigurationProperties('datasource')
@ConditionalOnProperty('datasource.dialect', { havingValue: 'd1' })
export class D1DatasourceConfig {
  dialect = '';
  /** The Cloudflare D1 binding name (default: `'DB'`). */
  binding = 'DB';
}

/**
 * Request-scoped KyselyDatabase for Cloudflare D1.
 *
 * Each request gets a fresh Kysely instance backed by the D1 binding
 * from the request's env (passed via `RequestScopeManager.run(fn, env)`).
 */
@RequestScoped()
@ConditionalOnProperty('datasource.dialect', { havingValue: 'd1' })
export class D1KyselyDatabase extends KyselyDatabase {
  private _kysely?: Kysely<any>;

  constructor(private readonly config: D1DatasourceConfig) {
    super();
  }

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'D1KyselyDatabase: not initialized. Wait for @PostConstruct to complete.',
      );
    }
    return this._kysely;
  }

  get supportsReturning(): boolean {
    return true;
  }

  @PostConstruct()
  async init() {
    const d1 = RequestScopeManager.getBinding<any>(this.config.binding);
    try {
      const { Kysely: KyselyCtor } = await importOptional('kysely');
      const { D1Dialect } = await importOptional('kysely-d1');
      this._kysely = new KyselyCtor({
        dialect: new D1Dialect({ database: d1 }),
      });
    } catch (err) {
      throw new Error(
        `[D1KyselyDatabase] Failed to initialize: ${err instanceof Error ? err.message : err}\n` +
          `  Review your 'datasource.*' configuration.`,
      );
    }
  }
}

async function importOptional(packageName: string): Promise<any> {
  try {
    return await import(packageName);
  } catch {
    throw new Error(
      `D1KyselyDatabase requires '${packageName}' but it is not installed. ` +
        `Install it with your package manager.`,
    );
  }
}
