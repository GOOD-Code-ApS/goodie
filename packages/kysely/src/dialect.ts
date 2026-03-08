/**
 * Supported database dialects.
 *
 * Used by `DatasourceConfig` to configure the database connection
 * and by `TransactionManager` to determine dialect capabilities
 * like `RETURNING` clause support.
 */
export type Dialect =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'neon'
  | 'planetscale'
  | 'libsql';

/** All valid dialect values. Used for validation at config injection time. */
export const DIALECTS: readonly Dialect[] = [
  'postgres',
  'mysql',
  'sqlite',
  'neon',
  'planetscale',
  'libsql',
] as const;

/**
 * Whether the given dialect supports `RETURNING` clauses natively.
 *
 * - **postgres / neon**: `INSERT/UPDATE/DELETE ... RETURNING *`
 * - **sqlite / libsql**: `INSERT/UPDATE/DELETE ... RETURNING *` (since 3.35)
 * - **mysql / planetscale**: No native support — falls back to INSERT + SELECT
 */
export function supportsReturning(dialect: Dialect): boolean {
  switch (dialect) {
    case 'postgres':
    case 'neon':
    case 'sqlite':
    case 'libsql':
      return true;
    case 'mysql':
    case 'planetscale':
      return false;
  }
}

/**
 * Validate that a string is a supported dialect.
 * Throws at DI startup if the user provides an unsupported value.
 */
export function validateDialect(value: string): Dialect {
  if (DIALECTS.includes(value as Dialect)) {
    return value as Dialect;
  }
  throw new Error(
    `Unsupported datasource dialect: '${value}'. Supported dialects: ${DIALECTS.join(', ')}`,
  );
}
