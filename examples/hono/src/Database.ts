import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Database {
  constructor(readonly drizzle: PostgresJsDatabase<any>) {}
}
