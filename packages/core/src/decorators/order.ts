/**
 * Sets the execution order for beans that participate in ordered collections
 * (e.g. `OnStart` lifecycle beans).
 *
 * Lower values execute first. Default order is 0. Negative values are allowed
 * and run before default-ordered beans.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time
 * and stores the value in `metadata.order`.
 *
 * @example
 * @Order(-10)
 * @Singleton()
 * class EarlyStartupService extends OnStart { ... }
 *
 * @param value - The order value (lower = earlier). Defaults to 0 if omitted.
 */
export function Order(_value?: number): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
