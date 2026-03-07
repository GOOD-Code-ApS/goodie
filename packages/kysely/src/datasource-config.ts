import {
  ConfigurationProperties,
  PostConstruct,
  Singleton,
} from '@goodie-ts/core';
import { DIALECTS, validateDialect } from './dialect.js';

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
  /**
   * Runtime binding name for dialects that use platform bindings instead of
   * connection strings (e.g. Cloudflare D1). The binding is resolved at
   * request time via `RuntimeBindings.get(binding)`.
   */
  binding = '';

  constructor(readonly pool: PoolConfig) {}

  @PostConstruct()
  validate() {
    if (!this.dialect) {
      throw new Error(
        `DatasourceConfig: 'datasource.dialect' is required. Supported dialects: ${DIALECTS.join(', ')}`,
      );
    }
    validateDialect(this.dialect);

    const needsBinding = this.dialect === 'd1';
    if (needsBinding) {
      if (!this.binding) {
        throw new Error(
          "DatasourceConfig: 'datasource.binding' is required for the 'd1' dialect. " +
            "Set it to your D1 binding name (e.g. 'DB').",
        );
      }
    } else if (!this.url) {
      throw new Error(
        "DatasourceConfig: 'datasource.url' is required. Example: postgres://localhost:5432/mydb",
      );
    }
  }
}
