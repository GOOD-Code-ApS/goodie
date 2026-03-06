import type { InvocationContext, MethodInterceptor } from '@goodie-ts/core';
import { Singleton } from '@goodie-ts/core';

/** Metadata shape expected from the resilience transformer plugin. */
interface TimeoutMetadata {
  duration: number;
}

/** Error thrown when a method call exceeds its timeout. */
export class TimeoutError extends Error {
  constructor(methodKey: string, duration: number) {
    super(`Method ${methodKey} timed out after ${duration}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * AOP interceptor that enforces a timeout on method execution.
 *
 * For async methods, uses `Promise.race` with a timeout promise.
 * For sync methods, the timeout cannot be enforced (sync code blocks the
 * event loop), so the result is returned as-is.
 */
@Singleton()
export class TimeoutInterceptor implements MethodInterceptor {
  intercept(ctx: InvocationContext): unknown {
    const meta = ctx.metadata as TimeoutMetadata | undefined;
    if (!meta) return ctx.proceed();

    const key = `${ctx.className}:${ctx.methodName}`;
    const result = ctx.proceed();

    // Timeout only applies to async methods (sync methods can't be interrupted)
    if (result instanceof Promise) {
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new TimeoutError(key, meta.duration)),
          meta.duration,
        );
      });
      return Promise.race([result, timeoutPromise]).finally(() =>
        clearTimeout(timeoutId),
      );
    }

    return result;
  }
}
