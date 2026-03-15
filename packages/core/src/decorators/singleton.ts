/**
 * Marks a class as a singleton component.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Singleton()
 * class UserService { ... }
 */
export function Singleton(): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
