import {
  ConditionalOnProperty,
  ConfigurationProperties,
  PostConstruct,
  PreDestroy,
  Singleton,
} from '@goodie-ts/core';
import type { Kysely } from 'kysely';
import { KyselyDatabase } from '../kysely-database.js';

@Singleton()
@ConfigurationProperties('datasource')
@ConditionalOnProperty('datasource.dialect', { havingValue: 'planetscale' })
export class PlanetscaleDatasourceConfig {
  dialect = '';
  /** PlanetScale connection URL. */
  url = '';
  username = '';
  password = '';
  host = '';
}

@Singleton()
@ConditionalOnProperty('datasource.dialect', { havingValue: 'planetscale' })
export class PlanetscaleKyselyDatabase extends KyselyDatabase {
  private _kysely?: Kysely<any>;

  constructor(private readonly config: PlanetscaleDatasourceConfig) {
    super();
  }

  get kysely(): Kysely<any> {
    if (!this._kysely) {
      throw new Error(
        'PlanetscaleKyselyDatabase: not initialized. Wait for @PostConstruct to complete.',
      );
    }
    return this._kysely;
  }

  get supportsReturning(): boolean {
    return false;
  }

  @PostConstruct()
  async init() {
    try {
      const mod = await importOptional('kysely-planetscale');
      const { Kysely: KyselyCtor } = await importOptional('kysely');
      this._kysely = new KyselyCtor({
        dialect: new mod.PlanetScaleDialect({
          url: this.config.url || undefined,
          username: this.config.username || undefined,
          password: this.config.password || undefined,
          host: this.config.host || undefined,
        }),
      });
    } catch (err) {
      throw new Error(
        `[PlanetscaleKyselyDatabase] Failed to initialize: ${err instanceof Error ? err.message : err}\n` +
          `  Review your 'datasource.*' configuration.`,
      );
    }
  }

  @PreDestroy()
  async destroy() {
    await this._kysely?.destroy();
  }
}

async function importOptional(packageName: string): Promise<any> {
  try {
    return await import(packageName);
  } catch {
    throw new Error(
      `PlanetscaleKyselyDatabase requires '${packageName}' but it is not installed. ` +
        `Install it with your package manager.`,
    );
  }
}
