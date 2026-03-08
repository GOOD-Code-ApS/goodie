import {
  ConditionalOnProperty,
  ConfigurationProperties,
  Singleton,
} from '@goodie-ts/core';

/**
 * Connection pool configuration, bound from `datasource.pool.*` keys.
 *
 * Only active for dialects that use connection pools (postgres, mysql).
 * Serverless and embedded dialects (neon, planetscale, libsql, sqlite, d1)
 * don't use pooling.
 */
@Singleton()
@ConfigurationProperties('datasource.pool')
@ConditionalOnProperty('datasource.dialect', {
  havingValue: ['postgres', 'mysql'],
})
export class PoolConfig {
  min = 2;
  max = 10;
}
