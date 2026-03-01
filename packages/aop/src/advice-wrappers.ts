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

/** Wrap an AfterAdvice into a MethodInterceptor for the interceptor chain. */
export function wrapAfterAdvice(advice: AfterAdvice): MethodInterceptor {
  return {
    intercept(ctx: InvocationContext) {
      const result = ctx.proceed();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then((value) =>
          Promise.resolve(
            advice.after(
              {
                className: ctx.className,
                methodName: ctx.methodName,
                args: ctx.args,
                target: ctx.target,
              },
              value,
            ),
          ).then(() => value),
        );
      }
      const adviceResult = advice.after(
        {
          className: ctx.className,
          methodName: ctx.methodName,
          args: ctx.args,
          target: ctx.target,
        },
        result,
      );
      if (
        adviceResult &&
        typeof (adviceResult as Promise<void>).then === 'function'
      ) {
        return (adviceResult as Promise<void>).then(() => result);
      }
      return result;
    },
  };
}
