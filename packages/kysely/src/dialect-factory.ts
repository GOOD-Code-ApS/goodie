import type { DatasourceConfig } from './datasource-config.js';
import type { Dialect } from './dialect.js';

/**
 * Create a Kysely dialect instance from DatasourceConfig.
 *
 * Dynamically imports the appropriate driver package based on `config.dialect`.
 * The driver packages are optional peer dependencies — users install only what they need.
 */
export default async function createDialect(config: DatasourceConfig) {
  const dialect = config.dialect as Dialect;
  switch (dialect) {
    case 'postgres':
      return createPostgresDialect(config);
    case 'mysql':
      return createMysqlDialect(config);
    case 'sqlite':
      return createSqliteDialect(config);
  }
}

async function createPostgresDialect(config: DatasourceConfig) {
  const { Pool } = await import('pg');
  const { PostgresDialect } = await import('kysely');
  return new PostgresDialect({
    pool: new Pool({
      connectionString: config.url,
      min: config.pool.min,
      max: config.pool.max,
    }),
  });
}

async function createMysqlDialect(config: DatasourceConfig) {
  const mysql2 = await import('mysql2/promise');
  const { MysqlDialect } = await import('kysely');
  return new MysqlDialect({
    pool: mysql2.createPool({
      uri: config.url,
      connectionLimit: config.pool.max,
    }),
  });
}

async function createSqliteDialect(config: DatasourceConfig) {
  const BetterSqlite3 = await import('better-sqlite3');
  const { SqliteDialect } = await import('kysely');
  return new SqliteDialect({
    database: new BetterSqlite3.default(config.url),
  });
}
