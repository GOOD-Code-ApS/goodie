import type { InvocationContext, MethodInterceptor } from '@goodie-ts/aop';
import { Singleton } from '@goodie-ts/decorators';

/** Metadata shape expected from the resilience transformer plugin. */
interface RetryMetadata {
  maxAttempts: number;
  delay: number;
  multiplier: number;
}

/**
 * AOP interceptor that retries failed method calls with configurable
 * backoff strategy (exponential backoff with random jitter).
 *
 * Reads retry configuration from `ctx.metadata` (set by the resilience
 * transformer plugin).
 *
 * **Design note — interceptor chain:** Retry sits innermost in the interceptor
 * chain (order -10). On retry, `proceed()` calls the target method directly —
 * outer interceptors (circuit breaker, timeout) are NOT re-entered. This is
 * intentional: the timeout deadline applies to the total call including all
 * retries, and the circuit breaker tracks the overall outcome, not individual
 * retry attempts.
 *
 * **Design note — sync methods:** When a sync method fails and retries are
 * needed, the retry delay uses `setTimeout`, which returns a `Promise`.
 * As a result, decorated sync methods effectively become async on the first
 * failure. Callers should always `await` the return value of `@Retryable`
 * methods.
 */
@Singleton()
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

    // Exponential backoff with random jitter (50–100% of computed delay)
    // to prevent thundering herd when many callers retry simultaneously.
    const baseDelay = meta.delay * meta.multiplier ** (attempt - 1);
    const delayMs = baseDelay * (0.5 + Math.random() * 0.5);

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
