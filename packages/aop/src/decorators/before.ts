import type { BeforeAdvice } from '../types.js';

type Constructor<T = BeforeAdvice> = new (...args: any[]) => T;

export interface BeforeOptions {
  order?: number;
}

/**
 * Method decorator that runs advice before the method.
 * The advice class should implement `BeforeAdvice`.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The `@goodie-ts/aop` transformer plugin reads decorator arguments via
 * ts-morph AST inspection and generates `buildInterceptorChain()` calls
 * with `wrapBeforeAdvice()` in the factory function.
 */
export function Before(
  _adviceClass: Constructor,
  _opts?: BeforeOptions,
): MethodDecorator {
  return ((_target: any, _context: ClassMethodDecoratorContext) => {
    // No-op: decorator arguments are read at compile time by the AOP transformer plugin
  }) as MethodDecorator;
}
