import type {
  AfterAdvice,
  BeforeAdvice,
  InvocationContext,
  MethodInterceptor,
} from './types.js';

/** Wrap a BeforeAdvice into a MethodInterceptor for the interceptor chain. */
export function wrapBeforeAdvice(advice: BeforeAdvice): MethodInterceptor {
  return {
    intercept(ctx: InvocationContext) {
      const result = advice.before({
        className: ctx.className,
        methodName: ctx.methodName,
        args: ctx.args,
        target: ctx.target,
      });
      if (result && typeof (result as Promise<void>).then === 'function') {
        return (result as Promise<void>).then(() => ctx.proceed());
      }
      return ctx.proceed();
    },
  };
}

/**
 * Wrap an AfterAdvice into a MethodInterceptor for the interceptor chain.
 *
 * **Note:** If the after-advice is async but the intercepted method is sync,
 * the return type changes from `T` to `Promise<T>`. This is inherent to
 * async interceptor chains — callers should `await` the result when using
 * async advice on sync methods.
 */
export function wrapAfterAdvice(advice: AfterAdvice): MethodInterceptor {
  return {
    intercept(ctx: InvocationContext) {
      const adviceCtx = {
        className: ctx.className,
        methodName: ctx.methodName,
        args: ctx.args,
        target: ctx.target,
      };
      const result = ctx.proceed();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        // Async original method: wait for result, run advice, return original value
        return (result as Promise<unknown>).then((value) =>
          Promise.resolve(advice.after(adviceCtx, value)).then(() => value),
        );
      }
      // Sync original method
      const adviceResult = advice.after(adviceCtx, result);
      if (
        adviceResult &&
        typeof (adviceResult as Promise<void>).then === 'function'
      ) {
        // Async advice on sync method: returns Promise<T> wrapping the sync result
        return (adviceResult as Promise<void>).then(() => result);
      }
      return result;
    },
  };
}
