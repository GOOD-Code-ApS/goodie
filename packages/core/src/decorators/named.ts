/**
 * Assigns a qualifier name to a component, used for disambiguation
 * when multiple implementations exist for the same type.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Named('primary')
 * @Singleton()
 * class PrimaryUserRepository implements UserRepository { ... }
 */
export function Named(_name: string): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
