import type { InvocationContext, MethodInterceptor } from './types.js';

/**
 * Build an interceptor chain for a method.
 * The chain executes interceptors in order, with the last one calling the original method.
 *
 * @param interceptors - Ordered list of interceptors.
 * @param target - The target object instance.
 * @param className - The class name (for context).
 * @param methodName - The method name (for context).
 * @param originalMethod - The original method to call at the end of the chain.
 * @param interceptorMetadata - Optional per-interceptor metadata (indexed by position).
 */
export function buildInterceptorChain(
  interceptors: MethodInterceptor[],
  target: unknown,
  className: string,
  methodName: string,
  originalMethod: (...args: unknown[]) => unknown,
  interceptorMetadata?: Array<Record<string, unknown> | undefined>,
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

      const currentIndex = index;
      const interceptor = interceptors[index++];
      const ctx: InvocationContext = {
        className,
        methodName,
        args: currentArgs,
        target,
        proceed,
        metadata: interceptorMetadata?.[currentIndex],
      };

      return interceptor.intercept(ctx);
    }

    return proceed(...args);
  };
}
