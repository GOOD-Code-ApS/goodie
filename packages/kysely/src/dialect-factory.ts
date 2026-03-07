import type { DatasourceConfig } from './datasource-config.js';
import { DIALECTS, type Dialect } from './dialect.js';

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
    case 'neon':
      return createNeonDialect(config);
    case 'planetscale':
      return createPlanetscaleDialect(config);
    case 'd1':
      return createD1Dialect(config);
    case 'libsql':
      return createLibsqlDialect(config);
    default:
      throw new Error(
        `Unsupported dialect: '${dialect}'. Supported dialects: ${DIALECTS.join(', ')}.`,
      );
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

async function createNeonDialect(config: DatasourceConfig) {
  const mod = await importOptional('kysely-neon');
  return new mod.NeonDialect({
    connectionString: config.url,
  });
}

async function createPlanetscaleDialect(config: DatasourceConfig) {
  const mod = await importOptional('kysely-planetscale');
  return new mod.PlanetScaleDialect({
    url: config.url,
  });
}

async function createD1Dialect(config: DatasourceConfig) {
  const mod = await importOptional('kysely-d1');
  const { RuntimeBindings } = await import('@goodie-ts/core');
  const database = RuntimeBindings.get(config.binding);
  return new mod.D1Dialect({ database });
}

async function createLibsqlDialect(config: DatasourceConfig) {
  const mod = await importOptional('@libsql/kysely-libsql');
  return new mod.LibsqlDialect({
    url: config.url,
  });
}

async function importOptional(packageName: string): Promise<any> {
  try {
    return await import(packageName);
  } catch {
    throw new Error(
      `Dialect requires '${packageName}' but it is not installed. ` +
        `Run: npm install ${packageName}`,
    );
  }
}
