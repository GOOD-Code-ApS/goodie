import type { MethodInterceptor } from '../types.js';

type Constructor<T = MethodInterceptor> = new (...args: any[]) => T;

export interface AroundOptions {
  order?: number;
}

/**
 * Method decorator that applies an interceptor around the method.
 * The interceptor's `intercept()` wraps the full method execution.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The `@goodie-ts/aop` transformer plugin reads decorator arguments via
 * ts-morph AST inspection and generates `buildInterceptorChain()` calls
 * in the factory function.
 */
export function Around(
  _interceptorClass: Constructor,
  _opts?: AroundOptions,
): MethodDecorator {
  return ((_target: any, _context: ClassMethodDecoratorContext) => {
    // No-op: decorator arguments are read at compile time by the AOP transformer plugin
  }) as MethodDecorator;
}
