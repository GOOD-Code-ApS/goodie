import { describe, expect, it, vi } from 'vitest';
import { TransactionManager } from '../src/transaction-manager.js';

/** Create a mock Kysely instance with configurable transaction behavior. */
function createMockKysely(opts?: { supportsReturning?: boolean }) {
  const mockTransaction = { isTransaction: true };

  const kysely = {
    transaction: () => ({
      execute: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => {
        return fn(mockTransaction);
      }),
    }),
    getExecutor: () => ({
      adapter: { supportsReturning: opts?.supportsReturning ?? false },
    }),
  };

  return { kysely, mockTransaction };
}

/** Create and configure a TransactionManager with a mock Kysely. */
function createTm() {
  const { kysely, mockTransaction } = createMockKysely();
  const tm = new TransactionManager();
  tm.configure(kysely as never);
  return { tm, kysely, mockTransaction };
}

describe('TransactionManager', () => {
  it('should run a function inside a transaction', async () => {
    const { tm } = createTm();

    let insideTransaction = false;
    await tm.runInTransaction(async () => {
      insideTransaction = tm.currentTransaction() !== undefined;
    });

    expect(insideTransaction).toBe(true);
  });

  it('should return undefined when not in a transaction', () => {
    const { tm } = createTm();
    expect(tm.currentTransaction()).toBeUndefined();
  });

  it('should reuse existing transaction with REQUIRED propagation', async () => {
    const { tm } = createTm();

    let outerTrx: unknown;
    let innerTrx: unknown;

    await tm.runInTransaction(async () => {
      outerTrx = tm.currentTransaction();
      await tm.runInTransaction(async () => {
        innerTrx = tm.currentTransaction();
      });
    });

    expect(outerTrx).toBe(innerTrx);
  });

  it('should start new transaction with REQUIRES_NEW', async () => {
    const { kysely, mockTransaction } = createMockKysely();
    const tm = new TransactionManager();
    let transactionCallCount = 0;
    kysely.transaction = () => ({
      execute: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => {
        transactionCallCount++;
        return fn({ ...mockTransaction, call: transactionCallCount });
      }),
    });
    tm.configure(kysely as never);

    let outerTrx: unknown;
    let innerTrx: unknown;

    await tm.runInTransaction(async () => {
      outerTrx = tm.currentTransaction();
      await tm.runInTransaction(async () => {
        innerTrx = tm.currentTransaction();
      }, true);
    });

    expect(transactionCallCount).toBe(2);
    expect(outerTrx).not.toBe(innerTrx);
  });

  it('should return raw Kysely when not in a transaction', () => {
    const { tm, kysely } = createTm();
    expect(tm.getConnection()).toBe(kysely);
  });

  it('should return transaction when inside one', async () => {
    const { tm, mockTransaction } = createTm();

    let connection: unknown;
    await tm.runInTransaction(async () => {
      connection = tm.getConnection();
    });

    expect(connection).toBe(mockTransaction);
  });

  it('should propagate errors from the transaction callback', async () => {
    const { tm } = createTm();

    await expect(
      tm.runInTransaction(async () => {
        throw new Error('rollback me');
      }),
    ).rejects.toThrow('rollback me');
  });

  it('should return the result from the transaction callback', async () => {
    const { tm } = createTm();

    const result = await tm.runInTransaction(async () => {
      return { id: 1, title: 'Test' };
    });

    expect(result).toEqual({ id: 1, title: 'Test' });
  });

  it('should throw when not configured and runInTransaction is called', async () => {
    const tm = new TransactionManager();

    await expect(
      tm.runInTransaction(async () => 'should fail'),
    ).rejects.toThrow('TransactionManager not configured');
  });

  it('should accept Kysely in constructor', async () => {
    const { kysely } = createMockKysely();
    const tm = new TransactionManager(kysely as never);

    const result = await tm.runInTransaction(async () => 'via constructor');
    expect(result).toBe('via constructor');
  });

  it('should accept a KyselyProvider (duck-typed object with .kysely) in constructor', async () => {
    const { kysely } = createMockKysely();
    const provider = { kysely: kysely as never };
    const tm = new TransactionManager(provider);

    const result = await tm.runInTransaction(async () => 'via provider');
    expect(result).toBe('via provider');
  });

  it('should use the .kysely property from a KyselyProvider, not the provider itself', () => {
    const { kysely } = createMockKysely();
    const provider = { kysely: kysely as never };
    const tm = new TransactionManager(provider);

    // getConnection() should return the raw kysely, not the provider wrapper
    expect(tm.getConnection()).toBe(kysely);
  });

  it('should make provider.kysely transaction-aware via property redefinition', async () => {
    const { kysely, mockTransaction } = createMockKysely();
    const provider = { kysely: kysely as never };
    const tm = new TransactionManager(provider);

    // Outside a transaction: provider.kysely returns the raw Kysely
    expect(provider.kysely).toBe(kysely);

    // Inside a transaction: provider.kysely returns the active transaction
    let connectionDuringTx: unknown;
    await tm.runInTransaction(async () => {
      connectionDuringTx = provider.kysely;
    });

    expect(connectionDuringTx).toBe(mockTransaction);
  });

  it('should accept no args and fall back to configure()', async () => {
    const tm = new TransactionManager();
    const { kysely } = createMockKysely();
    tm.configure(kysely as never);

    const result = await tm.runInTransaction(async () => 'via configure');
    expect(result).toBe('via configure');
  });

  it('should eagerly derive supportsReturning at configure time', () => {
    const { kysely } = createMockKysely({ supportsReturning: true });
    const tm = new TransactionManager();
    tm.configure(kysely as never);

    // Should be available immediately without lazy evaluation
    expect(tm.supportsReturning).toBe(true);
  });

  it('should accept explicit supportsReturning via options to avoid Kysely internals', () => {
    // Kysely mock returns false from getExecutor, but explicit option overrides it
    const { kysely } = createMockKysely({ supportsReturning: false });
    const tm = new TransactionManager(kysely as never, {
      supportsReturning: true,
    });

    expect(tm.supportsReturning).toBe(true);
  });

  it('should accept explicit supportsReturning in configure() options', () => {
    const { kysely } = createMockKysely({ supportsReturning: false });
    const tm = new TransactionManager();
    tm.configure(kysely as never, { supportsReturning: true });

    expect(tm.supportsReturning).toBe(true);
  });

  it('should throw when supportsReturning is accessed before configuration', () => {
    const tm = new TransactionManager();
    expect(() => tm.supportsReturning).toThrow(
      'TransactionManager not configured',
    );
  });

  it('should reset supportsReturning cache when configure() is called', () => {
    function createKyselyWithReturning(supports: boolean) {
      return {
        ...createMockKysely().kysely,
        getExecutor: () => ({
          adapter: { supportsReturning: supports },
        }),
      };
    }

    const tm = new TransactionManager();
    const kysely1 = createKyselyWithReturning(true);
    tm.configure(kysely1 as never);

    expect(tm.supportsReturning).toBe(true);

    // Reconfigure with a dialect that does NOT support returning
    const kysely2 = createKyselyWithReturning(false);
    tm.configure(kysely2 as never);

    // Should reflect the new dialect, not the cached value
    expect(tm.supportsReturning).toBe(false);
  });
});
