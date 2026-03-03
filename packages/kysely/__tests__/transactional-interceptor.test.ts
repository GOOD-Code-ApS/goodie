import type { InvocationContext } from '@goodie-ts/aop';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionManager } from '../src/transaction-manager.js';
import { TransactionalInterceptor } from '../src/transactional-interceptor.js';

function createMockTransactionManager() {
  const runInTransaction = vi.fn(
    async (fn: () => Promise<unknown>, _requiresNew?: boolean) => fn(),
  );

  return {
    runInTransaction,
    currentTransaction: vi.fn(),
    getConnection: vi.fn(),
  } as unknown as TransactionManager & {
    runInTransaction: ReturnType<typeof vi.fn>;
  };
}

function createContext(
  overrides?: Partial<InvocationContext>,
): InvocationContext {
  return {
    className: 'TodoService',
    methodName: 'create',
    args: [],
    target: {},
    proceed: () => Promise.resolve({ id: 1 }),
    ...overrides,
  };
}

describe('TransactionalInterceptor', () => {
  it('should pass through when no metadata is present', () => {
    const tm = createMockTransactionManager();
    const interceptor = new TransactionalInterceptor(tm);

    const ctx = createContext({ proceed: () => 'direct' });
    expect(interceptor.intercept(ctx)).toBe('direct');
    expect(tm.runInTransaction).not.toHaveBeenCalled();
  });

  it('should wrap method in transaction with REQUIRED propagation', async () => {
    const tm = createMockTransactionManager();
    const interceptor = new TransactionalInterceptor(tm);

    const ctx = createContext({
      proceed: () => Promise.resolve('created'),
      metadata: { propagation: 'REQUIRED' },
    });

    const result = await interceptor.intercept(ctx);
    expect(result).toBe('created');
    expect(tm.runInTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      false,
    );
  });

  it('should wrap method in transaction with REQUIRES_NEW propagation', async () => {
    const tm = createMockTransactionManager();
    const interceptor = new TransactionalInterceptor(tm);

    const ctx = createContext({
      proceed: () => Promise.resolve('created'),
      metadata: { propagation: 'REQUIRES_NEW' },
    });

    const result = await interceptor.intercept(ctx);
    expect(result).toBe('created');
    expect(tm.runInTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      true,
    );
  });

  it('should propagate errors from the wrapped method', async () => {
    const tm = createMockTransactionManager();
    const interceptor = new TransactionalInterceptor(tm);

    const ctx = createContext({
      proceed: () => Promise.reject(new Error('db error')),
      metadata: { propagation: 'REQUIRED' },
    });

    await expect(interceptor.intercept(ctx)).rejects.toThrow('db error');
  });

  it('should call proceed exactly once', async () => {
    const tm = createMockTransactionManager();
    const interceptor = new TransactionalInterceptor(tm);
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        return Promise.resolve('ok');
      },
      metadata: { propagation: 'REQUIRED' },
    });

    await interceptor.intercept(ctx);
    expect(callCount).toBe(1);
  });
});
