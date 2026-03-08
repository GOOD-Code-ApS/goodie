import type { Kysely } from 'kysely';

/**
 * Abstract base for Kysely database access.
 *
 * Non-generic (`Kysely<any>`) by design. Users bridge to their schema
 * type via a `@Module` with `@Provides`:
 * ```typescript
 * @Module()
 * class DatabaseModule {
 *   constructor(private db: KyselyDatabase) {}
 *
 *   @Provides()
 *   typedKysely(): Kysely<DB> {
 *     return this.db.kysely as Kysely<DB>;
 *   }
 * }
 * ```
 *
 * Concrete implementations are conditionally selected at build time
 * based on `datasource.dialect` in the config.
 */
export abstract class KyselyDatabase {
  abstract get kysely(): Kysely<any>;

  /**
   * Whether the dialect supports `RETURNING` clauses natively.
   * Used by `TransactionManager` for optimized insert/update/delete operations.
   */
  abstract get supportsReturning(): boolean;
}
