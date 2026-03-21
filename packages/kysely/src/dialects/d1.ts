import {
  ConditionalOnProperty,
  Config,
  OnInit,
  RequestScoped,
  RequestScopeManager,
  Singleton,
} from '@goodie-ts/core';
import type { Kysely } from 'kysely';
import { KyselyDatabase } from '../kysely-database.js';

@Singleton()
@Config('datasource')
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
        'D1KyselyDatabase: not initialized. Wait for @OnInit to complete.',
      );
    }
    return this._kysely;
  }

  /** D1 is SQLite-based, which supports RETURNING since version 3.35.0. */
  get supportsReturning(): boolean {
    return true;
  }

  @OnInit()
  async init() {
    const d1 = RequestScopeManager.getBinding<any>(this.config.binding);
    // Static string specifiers so CF Workers bundlers (esbuild) can resolve them.
    // Do NOT extract into a helper function — the bundler must see the literal string.
    let KyselyCtor: typeof import('kysely').Kysely;
    let D1Dialect: typeof import('kysely-d1').D1Dialect;
    try {
      ({ Kysely: KyselyCtor } = await import('kysely'));
    } catch {
      throw new Error(
        "D1KyselyDatabase requires 'kysely' but it is not installed. " +
          'Install it with your package manager.',
      );
    }
    try {
      ({ D1Dialect } = await import('kysely-d1'));
    } catch {
      throw new Error(
        "D1KyselyDatabase requires 'kysely-d1' but it is not installed. " +
          'Install it with your package manager.',
      );
    }
    try {
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
