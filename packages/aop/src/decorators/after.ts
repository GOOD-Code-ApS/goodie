import type { AfterAdvice } from '../types.js';

type Constructor<T = AfterAdvice> = new (...args: any[]) => T;

export interface AfterOptions {
  order?: number;
}

/**
 * Method decorator that runs advice after the method.
 * The advice class should implement `AfterAdvice`.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The `@goodie-ts/aop` transformer plugin reads decorator arguments via
 * ts-morph AST inspection and generates `buildInterceptorChain()` calls
 * with `wrapAfterAdvice()` in the factory function.
 */
export function After(
  _adviceClass: Constructor,
  _opts?: AfterOptions,
): MethodDecorator {
  return ((_target: any, _context: ClassMethodDecoratorContext) => {
    // No-op: decorator arguments are read at compile time by the AOP transformer plugin
  }) as MethodDecorator;
}
