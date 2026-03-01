import { AsyncLocalStorage } from 'node:async_hooks';
import type { Kysely, Transaction } from 'kysely';

/**
 * Manages database transactions using AsyncLocalStorage.
 *
 * Provides transaction propagation across async call chains without
 * explicitly threading a transaction object through every method.
 *
 * The plugin registers this as a synthetic bean. The user must call
 * `configure(kysely)` during application startup (e.g. in a @PostConstruct)
 * to provide the Kysely instance.
 */
export class TransactionManager {
  private readonly storage = new AsyncLocalStorage<Transaction<any>>();
  private kyselyRef?: Kysely<any>;

  constructor(kysely?: Kysely<any>) {
    this.kyselyRef = kysely;
  }

  /**
   * Configure the Kysely instance used for transactions.
   * Must be called before `runInTransaction` is used.
   */
  configure(kysely: Kysely<any>): void {
    this.kyselyRef = kysely;
  }

  private get kysely(): Kysely<any> {
    if (!this.kyselyRef) {
      throw new Error(
        'TransactionManager not configured. Call transactionManager.configure(kysely) in a @PostConstruct method.',
      );
    }
    return this.kyselyRef;
  }

  /**
   * Run a function inside a transaction.
   *
   * - If already in a transaction (REQUIRED propagation), reuses it.
   * - If `requiresNew` is true, always starts a fresh transaction.
   */
  async runInTransaction<T>(
    fn: () => Promise<T>,
    requiresNew = false,
  ): Promise<T> {
    const existing = this.storage.getStore();
    if (existing && !requiresNew) {
      return fn();
    }

    return this.kysely.transaction().execute(async (trx) => {
      return this.storage.run(trx, fn);
    });
  }

  /** Get the current transaction, or undefined if not in one. */
  currentTransaction(): Transaction<any> | undefined {
    return this.storage.getStore();
  }

  /**
   * Get the current database connection — transaction-aware.
   * Returns the active transaction if inside one, otherwise the raw Kysely instance.
   */
  getConnection(): Kysely<any> {
    return this.currentTransaction() ?? this.kysely;
  }
}
