import { Singleton } from '@goodie-ts/decorators';
import type { Database } from './Database.js';
import type { Todo } from './db/schema.js';

@Singleton()
export class TodoRepository {
  constructor(private database: Database) {}

  async findAll(): Promise<Todo[]> {
    return this.database.kysely.selectFrom('todos').selectAll().execute();
  }

  async findById(id: string): Promise<Todo | undefined> {
    return this.database.kysely
      .selectFrom('todos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async create(title: string): Promise<Todo> {
    return this.database.kysely
      .insertInto('todos')
      .values({ title })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(
    id: string,
    data: { title?: string; completed?: boolean },
  ): Promise<Todo | undefined> {
    return this.database.kysely
      .updateTable('todos')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<Todo | undefined> {
    return this.database.kysely
      .deleteFrom('todos')
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }
}
