/**
 * Marks a method to be called when the ApplicationContext is closed.
 *
 * Only effective on `@Singleton` / `@Transient` classes. The method
 * will be invoked during `close()` in reverse-topological order
 * (dependents destroyed before their dependencies).
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Singleton()
 * class DatabasePool {
 *   @OnDestroy()
 *   async shutdown() {
 *     await this.pool.end();
 *   }
 * }
 */
export function OnDestroy(): MethodDecorator_Stage3 {
  return () => {};
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
