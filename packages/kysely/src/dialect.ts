/**
 * Supported database dialects.
 *
 * Each dialect has a corresponding `KyselyDatabase` subclass that is
 * conditionally activated based on `datasource.dialect` config.
 */
export type Dialect =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'neon'
  | 'planetscale'
  | 'libsql'
  | 'd1';

/** All valid dialect values. */
export const DIALECTS: readonly Dialect[] = [
  'postgres',
  'mysql',
  'sqlite',
  'neon',
  'planetscale',
  'libsql',
  'd1',
] as const;
