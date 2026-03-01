import {
  PostConstruct,
  PreDestroy,
  Singleton,
  Value,
} from '@goodie-ts/decorators';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database as DB } from './db/schema.js';

@Singleton()
export class Database {
  @Value('DATABASE_URL', { default: 'postgres://localhost:5432/todos' })
  accessor databaseUrl!: string;

  kysely!: Kysely<DB>;

  @PostConstruct()
  init() {
    const pool = new Pool({ connectionString: this.databaseUrl });
    this.kysely = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  }

  @PreDestroy()
  async destroy() {
    await this.kysely.destroy();
  }
}
