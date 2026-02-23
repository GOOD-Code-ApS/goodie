import { Module, Provides } from '@goodie/decorators';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { Database } from './Database.js';
import * as schema from './db/schema.js';

@Module()
export class AppModule {
  @Provides()
  databaseUrl(): string {
    return process.env.DATABASE_URL ?? 'postgres://localhost:5432/todos';
  }

  @Provides()
  database(databaseUrl: string): Database {
    const client = postgres(databaseUrl);
    return new Database(drizzle(client, { schema }));
  }
}
