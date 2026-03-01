import type { InvocationContext, MethodInterceptor } from '@goodie-ts/aop';
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
export class TransactionalInterceptor implements MethodInterceptor {
  constructor(private readonly transactionManager: TransactionManager) {}

  intercept(ctx: InvocationContext): unknown {
    const meta = ctx.metadata as TransactionalMetadata | undefined;
    if (!meta) return ctx.proceed();

    const requiresNew = meta.propagation === 'REQUIRES_NEW';

    return this.transactionManager.runInTransaction(async () => {
      const result = ctx.proceed();
      // Ensure we await the result if it's a promise
      return result instanceof Promise ? result : result;
    }, requiresNew);
  }
}
