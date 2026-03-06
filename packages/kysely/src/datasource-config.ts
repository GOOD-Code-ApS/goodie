import {
  ConfigurationProperties,
  PostConstruct,
  Singleton,
} from '@goodie-ts/core';
import { validateDialect } from './dialect.js';

/**
 * Connection pool configuration, bound from `datasource.pool.*` keys.
 */
@Singleton()
@ConfigurationProperties('datasource.pool')
export class PoolConfig {
  min = 2;
  max = 10;
}

/**
 * Configuration properties for the datasource, bound from `datasource.*` keys.
 *
 * Users configure via `config/default.json`:
 * ```json
 * {
 *   "datasource": {
 *     "url": "postgres://localhost:5432/mydb",
 *     "dialect": "postgres",
 *     "pool": { "min": 2, "max": 10 }
 *   }
 * }
 * ```
 *
 * Or via environment variables: `DATASOURCE_URL`, `DATASOURCE_DIALECT`, etc.
 */
@Singleton()
@ConfigurationProperties('datasource')
export class DatasourceConfig {
  url = '';
  dialect = '';

  constructor(readonly pool: PoolConfig) {}

  @PostConstruct()
  validate() {
    if (!this.dialect) {
      throw new Error(
        "DatasourceConfig: 'datasource.dialect' is required. Supported dialects: postgres, mysql, sqlite",
      );
    }
    validateDialect(this.dialect);

    if (!this.url) {
      throw new Error(
        "DatasourceConfig: 'datasource.url' is required. Example: postgres://localhost:5432/mydb",
      );
    }
  }
}
