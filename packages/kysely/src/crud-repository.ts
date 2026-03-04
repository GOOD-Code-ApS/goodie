import type { Kysely } from 'kysely';
import type { TransactionManager } from './transaction-manager.js';

/**
 * Abstract base class for CRUD repositories backed by Kysely.
 *
 * Supports PostgreSQL, MySQL, and SQLite. Dialects that support `RETURNING`
 * (PostgreSQL) use it for efficient single-query inserts and deletes.
 * Other dialects fall back to INSERT + SELECT or SELECT + DELETE.
 *
 * Provides standard `findAll`, `findById`, `save`, and `deleteById` operations.
 * All queries use `TransactionManager.getConnection()` to be transaction-aware.
 *
 * The `db` getter returns `Kysely<any>` — typed table access is intentionally
 * erased because the transformer cannot generate clean tokens for `Kysely<DB>`
 * generic types. Subclasses can cast as needed for custom queries.
 *
 * @typeParam T - The entity/row type returned by queries.
 *
 * @example
 * ```typescript
 * class TodoRepository extends CrudRepository<Todo> {
 *   constructor(transactionManager: TransactionManager) {
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

  /** Whether the current dialect supports RETURNING clauses. */
  protected get returningSupported(): boolean {
    return this.transactionManager.supportsReturning;
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
    if (this.returningSupported) {
      return this.db
        .insertInto(this.tableName)
        .values(entity)
        .returningAll()
        .executeTakeFirstOrThrow() as Promise<T>;
    }
    const result = await this.db
      .insertInto(this.tableName)
      .values(entity)
      .executeTakeFirstOrThrow();
    const id = entity[this.idColumn] ?? result.insertId;
    if (id === undefined) {
      throw new Error(
        `Cannot re-fetch inserted row: no value for '${this.idColumn}' in entity and no auto-generated insertId`,
      );
    }
    return this.db
      .selectFrom(this.tableName)
      .selectAll()
      .where(this.idColumn, '=', id)
      .executeTakeFirstOrThrow() as Promise<T>;
  }

  async deleteById(id: unknown): Promise<T | undefined> {
    if (this.returningSupported) {
      return this.db
        .deleteFrom(this.tableName)
        .where(this.idColumn, '=', id)
        .returningAll()
        .executeTakeFirst() as Promise<T | undefined>;
    }
    // Wrap SELECT + DELETE in a transaction to prevent race conditions
    return this.db.transaction().execute(async (trx) => {
      const existing = (await trx
        .selectFrom(this.tableName)
        .selectAll()
        .where(this.idColumn, '=', id)
        .executeTakeFirst()) as T | undefined;
      if (!existing) return undefined;
      await trx
        .deleteFrom(this.tableName)
        .where(this.idColumn, '=', id)
        .execute();
      return existing;
    });
  }
}
