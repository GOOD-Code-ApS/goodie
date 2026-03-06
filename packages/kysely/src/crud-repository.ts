import type { Kysely } from 'kysely';
import type { TransactionManager } from './transaction-manager.js';

/**
 * Abstract base class for CRUD repositories backed by Kysely.
 *
 * Supports PostgreSQL, MySQL, and SQLite. Dialects that support `RETURNING`
 * (PostgreSQL and SQLite) use it for efficient single-query inserts and deletes.
 * MySQL falls back to INSERT + SELECT or SELECT + DELETE.
 *
 * Provides standard `findAll`, `findById`, `save`, and `deleteById` operations.
 * All queries use `TransactionManager.getConnection()` to be transaction-aware.
 *
 * The `db` getter returns `Kysely<DB>` for typed query builder access.
 * Subclasses specify their schema type via the `DB` type parameter.
 *
 * @typeParam T - The entity/row type returned by queries.
 * @typeParam DB - The Kysely database schema type (defaults to `any`).
 *
 * @example
 * ```typescript
 * class TodoRepository extends CrudRepository<Todo, Database> {
 *   constructor(transactionManager: TransactionManager) {
 *     super('todos', transactionManager);
 *   }
 * }
 * ```
 */
export abstract class CrudRepository<
  T extends Record<string, unknown>,
  DB = any,
> {
  constructor(
    protected readonly tableName: string,
    protected readonly transactionManager: TransactionManager,
    protected readonly idColumn: string = 'id',
  ) {}

  /** Get the current transaction-aware, typed Kysely connection for custom queries. */
  protected get db(): Kysely<DB> {
    return this.transactionManager.getConnection() as Kysely<DB>;
  }

  /** Untyped connection for base class methods (dynamic table/column names). */
  private get raw(): Kysely<any> {
    return this.transactionManager.getConnection() as Kysely<any>;
  }

  /** Whether the current dialect supports RETURNING clauses. */
  protected get returningSupported(): boolean {
    return this.transactionManager.supportsReturning;
  }

  async findAll(): Promise<T[]> {
    return this.raw.selectFrom(this.tableName).selectAll().execute() as Promise<
      T[]
    >;
  }

  async findById(id: unknown): Promise<T | undefined> {
    return this.raw
      .selectFrom(this.tableName)
      .selectAll()
      .where(this.idColumn, '=', id)
      .executeTakeFirst() as Promise<T | undefined>;
  }

  async save(entity: Record<string, unknown>): Promise<T> {
    if (this.returningSupported) {
      return this.raw
        .insertInto(this.tableName)
        .values(entity)
        .returningAll()
        .executeTakeFirstOrThrow() as Promise<T>;
    }
    // Wrap INSERT + SELECT in a transaction to prevent race conditions.
    // Uses runInTransaction (REQUIRED propagation) so it reuses an existing
    // @Transactional context instead of nesting (Kysely throws on nested tx).
    return this.transactionManager.runInTransaction(async () => {
      const result = await this.raw
        .insertInto(this.tableName)
        .values(entity)
        .executeTakeFirstOrThrow();
      const id = entity[this.idColumn] ?? result.insertId;
      if (id === undefined) {
        throw new Error(
          `Cannot re-fetch inserted row: no value for '${this.idColumn}' in entity and no auto-generated insertId`,
        );
      }
      return this.raw
        .selectFrom(this.tableName)
        .selectAll()
        .where(this.idColumn, '=', id)
        .executeTakeFirstOrThrow() as Promise<T>;
    });
  }

  async deleteById(id: unknown): Promise<T | undefined> {
    if (this.returningSupported) {
      return this.raw
        .deleteFrom(this.tableName)
        .where(this.idColumn, '=', id)
        .returningAll()
        .executeTakeFirst() as Promise<T | undefined>;
    }
    // Wrap SELECT + DELETE in a transaction to prevent race conditions.
    // Uses runInTransaction (REQUIRED propagation) so it reuses an existing
    // @Transactional context instead of nesting (Kysely throws on nested tx).
    return this.transactionManager.runInTransaction(async () => {
      const existing = (await this.raw
        .selectFrom(this.tableName)
        .selectAll()
        .where(this.idColumn, '=', id)
        .executeTakeFirst()) as T | undefined;
      if (!existing) return undefined;
      await this.raw
        .deleteFrom(this.tableName)
        .where(this.idColumn, '=', id)
        .execute();
      return existing;
    });
  }
}
