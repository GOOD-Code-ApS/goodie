import { PostConstruct, Singleton, Value } from '@goodie-ts/decorators';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema.js';

@Singleton()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Database {
  @Value('DATABASE_URL', { default: 'postgres://localhost:5432/todos' })
  accessor databaseUrl!: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drizzle!: PostgresJsDatabase<any>;

  @PostConstruct()
  init() {
    const client = postgres(this.databaseUrl);
    this.drizzle = drizzle(client, { schema });
  }
}
