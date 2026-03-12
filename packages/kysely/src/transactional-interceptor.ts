import type { InvocationContext, MethodInterceptor } from '@goodie-ts/core';
import { Singleton } from '@goodie-ts/core';
import type { TransactionManager } from './transaction-manager.js';

/** Metadata shape expected from the kysely transformer plugin. */
interface TransactionalMetadata {
  propagation: 'REQUIRED' | 'REQUIRES_NEW';
}

/**
 * AOP interceptor that wraps method execution in a database transaction.
 *
 * Reads propagation strategy from `ctx.metadata` (set by the kysely
 * transformer plugin).
 */
@Singleton()
export class TransactionalInterceptor implements MethodInterceptor {
  constructor(private readonly transactionManager: TransactionManager) {}

  intercept(ctx: InvocationContext): unknown {
    const meta = ctx.metadata as TransactionalMetadata | undefined;
    if (!meta) return ctx.proceed();

    const requiresNew = meta.propagation === 'REQUIRES_NEW';

    return this.transactionManager.runInTransaction(async () => {
      // Must await so rejected promises propagate within the transaction scope,
      // ensuring Kysely rolls back on failure.
      return await ctx.proceed();
    }, requiresNew);
  }
}
