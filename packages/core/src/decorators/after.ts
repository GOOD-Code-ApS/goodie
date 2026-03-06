import type { AfterAdvice } from '../aop-types.js';

type Constructor<T = AfterAdvice> = new (...args: any[]) => T;

export interface AfterOptions {
  order?: number;
}

/**
 * Method decorator that runs advice after the method.
 * The advice class should implement `AfterAdvice`.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The AOP transformer plugin reads decorator arguments via ts-morph AST
 * inspection and generates `buildInterceptorChain()` calls with
 * `wrapAfterAdvice()` in the factory function.
 */
export function After(
  _adviceClass: Constructor,
  _opts?: AfterOptions,
): MethodDecorator_Stage3 {
  return (_target, _context) => {
    // No-op: decorator arguments are read at compile time by the AOP transformer plugin
  };
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
