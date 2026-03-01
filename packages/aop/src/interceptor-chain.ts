import type { InvocationContext, MethodInterceptor } from './types.js';

/**
 * Build an interceptor chain for a method.
 * The chain executes interceptors in order, with the last one calling the original method.
 */
export function buildInterceptorChain(
  interceptors: MethodInterceptor[],
  target: unknown,
  className: string,
  methodName: string,
  originalMethod: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown | Promise<unknown> {
  return function intercepted(...args: unknown[]) {
    if (interceptors.length === 0) {
      return originalMethod.apply(target, args);
    }

    let index = 0;

    function proceed(...proceedArgs: unknown[]): unknown | Promise<unknown> {
      const currentArgs = proceedArgs.length > 0 ? proceedArgs : args;

      if (index >= interceptors.length) {
        return originalMethod.apply(target, currentArgs);
      }

      const interceptor = interceptors[index++];
      const ctx: InvocationContext = {
        className,
        methodName,
        args: currentArgs,
        target,
        proceed,
      };

      return interceptor.intercept(ctx);
    }

    return proceed(...args);
  };
}
