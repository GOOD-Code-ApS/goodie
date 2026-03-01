import { AsyncLocalStorage } from 'node:async_hooks';
import type { Kysely, Transaction } from 'kysely';

/**
 * An object that exposes a `.kysely` property — e.g. a Database wrapper class.
 * Used for duck-type detection in the TransactionManager constructor.
 */
export interface KyselyProvider {
  kysely: Kysely<any>;
}

/**
 * Manages database transactions using AsyncLocalStorage.
 *
 * Provides transaction propagation across async call chains without
 * explicitly threading a transaction object through every method.
 *
 * When auto-wired via `createKyselyPlugin({ database: 'Database' })`,
 * the constructor receives the Database bean and reads its `.kysely` property.
 * Manual `configure()` is still supported for backward compatibility.
 */
export class TransactionManager {
  private readonly storage = new AsyncLocalStorage<Transaction<any>>();
  private kyselyRef?: Kysely<any>;

  constructor(kyselyOrProvider?: Kysely<any> | KyselyProvider) {
    if (kyselyOrProvider) {
      this.kyselyRef =
        'kysely' in kyselyOrProvider
          ? kyselyOrProvider.kysely
          : kyselyOrProvider;
    }
  }

  /**
   * Configure the Kysely instance used for transactions.
   * Unnecessary when auto-wired via `createKyselyPlugin({ database: '...' })`.
   */
  configure(kysely: Kysely<any>): void {
    this.kyselyRef = kysely;
  }

  private get kysely(): Kysely<any> {
    if (!this.kyselyRef) {
      throw new Error(
        'TransactionManager not configured. Call transactionManager.configure(kysely) or use createKyselyPlugin({ database: "YourDatabase" }).',
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
