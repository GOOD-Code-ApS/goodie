/**
 * Marks a singleton component for eager instantiation during context creation.
 * By default, singletons are lazy (created on first `get()`).
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Eager()
 * @Singleton()
 * class StartupService { ... }
 */
export function Eager(): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
