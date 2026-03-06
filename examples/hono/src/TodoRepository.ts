import { Singleton } from '@goodie-ts/core';
import { Retryable } from '@goodie-ts/resilience';
// biome-ignore lint/style/useImportType: DI requires value import for constructor injection
import { Kysely } from 'kysely';
import type { Database as DB, Todo } from './db/schema.js';

@Singleton()
export class TodoRepository {
  constructor(private readonly kysely: Kysely<DB>) {}

  @Retryable({ maxAttempts: 3, delay: 100 })
  async findAll(): Promise<Todo[]> {
    return this.kysely.selectFrom('todos').selectAll().execute();
  }

  @Retryable({ maxAttempts: 3, delay: 100 })
  async findById(id: string): Promise<Todo | undefined> {
    return this.kysely
      .selectFrom('todos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async create(title: string): Promise<Todo> {
    return this.kysely
      .insertInto('todos')
      .values({ title })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(
    id: string,
    data: { title?: string; completed?: boolean },
  ): Promise<Todo | undefined> {
    return this.kysely
      .updateTable('todos')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<Todo | undefined> {
    return this.kysely
      .deleteFrom('todos')
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }
}
