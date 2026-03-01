import type { Kysely } from 'kysely';
import type { TransactionManager } from './transaction-manager.js';

/**
 * Abstract base class for CRUD repositories backed by Kysely.
 *
 * Provides standard `findAll`, `findById`, `save`, and `deleteById` operations.
 * All queries use `TransactionManager.getConnection()` to be transaction-aware.
 *
 * @typeParam T - The entity/row type returned by queries.
 *
 * @example
 * ```typescript
 * class TodoRepository extends CrudRepository<Todo> {
 *   constructor(transactionManager: TransactionManager<DB>) {
 *     super('todos', transactionManager);
 *   }
 * }
 * ```
 */
export abstract class CrudRepository<T extends Record<string, unknown>> {
  constructor(
    protected readonly tableName: string,
    protected readonly transactionManager: TransactionManager,
    protected readonly idColumn: string = 'id',
  ) {}

  /** Get the current transaction-aware Kysely connection. */
  protected get db(): Kysely<any> {
    return this.transactionManager.getConnection() as Kysely<any>;
  }

  async findAll(): Promise<T[]> {
    return this.db.selectFrom(this.tableName).selectAll().execute() as Promise<
      T[]
    >;
  }

  async findById(id: unknown): Promise<T | undefined> {
    return this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where(this.idColumn, '=', id)
      .executeTakeFirst() as Promise<T | undefined>;
  }

  async save(entity: Record<string, unknown>): Promise<T> {
    return this.db
      .insertInto(this.tableName)
      .values(entity)
      .returningAll()
      .executeTakeFirstOrThrow() as Promise<T>;
  }

  async deleteById(id: unknown): Promise<T | undefined> {
    return this.db
      .deleteFrom(this.tableName)
      .where(this.idColumn, '=', id)
      .returningAll()
      .executeTakeFirst() as Promise<T | undefined>;
  }
}
