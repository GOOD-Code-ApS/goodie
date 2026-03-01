import type { InvocationContext, MethodInterceptor } from '@goodie-ts/aop';

/** Metadata shape expected from the resilience transformer plugin. */
interface RetryMetadata {
  maxAttempts: number;
  delay: number;
  multiplier: number;
}

/**
 * AOP interceptor that retries failed method calls with configurable
 * backoff strategy.
 *
 * Reads retry configuration from `ctx.metadata` (set by the resilience
 * transformer plugin).
 */
export class RetryInterceptor implements MethodInterceptor {
  intercept(ctx: InvocationContext): unknown {
    const meta = ctx.metadata as RetryMetadata | undefined;
    if (!meta) return ctx.proceed();

    const result = this.tryCall(ctx, meta, 1);
    return result;
  }

  private tryCall(
    ctx: InvocationContext,
    meta: RetryMetadata,
    attempt: number,
  ): unknown {
    try {
      const result = ctx.proceed();

      if (result instanceof Promise) {
        return result.catch((error) =>
          this.handleError(ctx, meta, attempt, error),
        );
      }

      return result;
    } catch (error) {
      return this.handleError(ctx, meta, attempt, error);
    }
  }

  private handleError(
    ctx: InvocationContext,
    meta: RetryMetadata,
    attempt: number,
    error: unknown,
  ): unknown {
    if (attempt >= meta.maxAttempts) {
      throw error;
    }

    const delayMs = meta.delay * meta.multiplier ** (attempt - 1);

    // For async methods, use setTimeout-based delay
    return new Promise<unknown>((resolve, reject) => {
      setTimeout(() => {
        try {
          const result = this.tryCall(ctx, meta, attempt + 1);
          if (result instanceof Promise) {
            result.then(resolve, reject);
          } else {
            resolve(result);
          }
        } catch (retryError) {
          reject(retryError);
        }
      }, delayMs);
    });
  }
}
