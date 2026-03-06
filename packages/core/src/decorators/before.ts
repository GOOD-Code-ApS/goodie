import type { BeforeAdvice } from '../aop-types.js';

type Constructor<T = BeforeAdvice> = new (...args: any[]) => T;

export interface BeforeOptions {
  order?: number;
}

/**
 * Method decorator that runs advice before the method.
 * The advice class should implement `BeforeAdvice`.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The AOP transformer plugin reads decorator arguments via ts-morph AST
 * inspection and generates `buildInterceptorChain()` calls with
 * `wrapBeforeAdvice()` in the factory function.
 */
export function Before(
  _adviceClass: Constructor,
  _opts?: BeforeOptions,
): MethodDecorator_Stage3 {
  return (_target, _context) => {
    // No-op: decorator arguments are read at compile time by the AOP transformer plugin
  };
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
