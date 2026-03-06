import { Singleton } from '@goodie-ts/core';
// biome-ignore lint/style/useImportType: DI requires value import for constructor injection
import { CrudRepository, TransactionManager } from '@goodie-ts/kysely';
import { Retryable } from '@goodie-ts/resilience';
import type { Database, Todo } from './db/schema.js';

@Singleton()
export class TodoRepository extends CrudRepository<Todo, Database> {
  constructor(transactionManager: TransactionManager) {
    super('todos', transactionManager);
  }

  @Retryable({ maxAttempts: 3, delay: 100 })
  override async findAll(): Promise<Todo[]> {
    return super.findAll();
  }

  @Retryable({ maxAttempts: 3, delay: 100 })
  override async findById(id: unknown): Promise<Todo | undefined> {
    return super.findById(id);
  }

  async create(title: string): Promise<Todo> {
    return this.db
      .insertInto('todos')
      .values({ title })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(
    id: string,
    data: { title?: string; completed?: boolean },
  ): Promise<Todo | undefined> {
    return this.db
      .updateTable('todos')
      .set(data)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async delete(id: string): Promise<Todo | undefined> {
    return this.deleteById(id);
  }
}
