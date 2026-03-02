import { Migration } from '@goodie-ts/kysely';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

@Migration('001_create_todos')
export class CreateTodosTable {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('todos')
      .addColumn('id', 'uuid', (c) =>
        c.primaryKey().defaultTo(sql`gen_random_uuid()`),
      )
      .addColumn('title', 'text', (c) => c.notNull())
      .addColumn('completed', 'boolean', (c) => c.notNull().defaultTo(false))
      .addColumn('created_at', 'timestamp', (c) =>
        c.notNull().defaultTo(sql`now()`),
      )
      .execute();
  }

  async down(db: Kysely<any>) {
    await db.schema.dropTable('todos').execute();
  }
}
