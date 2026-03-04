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
  private testTransactionActive = false;
  private _supportsReturning?: boolean;

  constructor(kyselyOrProvider?: Kysely<any> | KyselyProvider) {
    if (kyselyOrProvider) {
      if ('kysely' in kyselyOrProvider) {
        this.kyselyRef = kyselyOrProvider.kysely;
        // Make the provider's .kysely property transaction-aware.
        // Any code accessing provider.kysely (e.g. database.kysely) will
        // automatically use the active transaction when inside one.
        const tm = this;
        Object.defineProperty(kyselyOrProvider, 'kysely', {
          get() {
            return tm.getConnection();
          },
          configurable: true,
        });
      } else {
        this.kyselyRef = kyselyOrProvider;
      }
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
    // Inside a test transaction, all queries already use the test transaction.
    // Skip creating new transactions to avoid Kysely's nested transaction error.
    if (this.testTransactionActive) {
      return fn();
    }

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

  /**
   * Whether the underlying dialect supports RETURNING clauses.
   * Detected once from the Kysely adapter and cached.
   */
  get supportsReturning(): boolean {
    if (this._supportsReturning === undefined) {
      this._supportsReturning =
        this.kysely.getExecutor().adapter.supportsReturning;
    }
    return this._supportsReturning;
  }

  /**
   * Start a test-scoped transaction that ALL queries will use.
   *
   * Replaces the internal Kysely reference with the transaction object,
   * so any code calling `getConnection()` or `database.kysely` (via the
   * provider proxy) will automatically use this transaction.
   *
   * Designed for test frameworks (e.g. vitest fixtures) where
   * AsyncLocalStorage context may not propagate through `use()`.
   *
   * @returns A rollback function — call it to roll back the transaction
   *          and restore the original Kysely instance.
   */
  async startTestTransaction(): Promise<() => Promise<void>> {
    const original = this.kyselyRef;

    let triggerRollback!: () => void;
    let transactionReady!: () => void;

    const readyPromise = new Promise<void>((resolve) => {
      transactionReady = resolve;
    });

    const rollbackPromise = this.kysely
      .transaction()
      .execute(async (trx) => {
        this.kyselyRef = trx as Kysely<any>;
        this.testTransactionActive = true;
        transactionReady();
        await new Promise<void>((_resolve, reject) => {
          triggerRollback = () => reject(new TestRollbackSignal());
        });
      })
      .catch((e: unknown) => {
        if (!(e instanceof TestRollbackSignal)) throw e;
      })
      .finally(() => {
        this.testTransactionActive = false;
        this.kyselyRef = original;
      });

    await readyPromise;

    return async () => {
      triggerRollback();
      await rollbackPromise;
    };
  }
}

/** @internal Sentinel error for test transaction rollback. */
class TestRollbackSignal extends Error {
  constructor() {
    super('TestRollbackSignal');
    this.name = 'TestRollbackSignal';
  }
}
