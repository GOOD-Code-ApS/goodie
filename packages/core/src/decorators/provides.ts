/**
 * Marks a method inside a `@Module()` class as a bean factory.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Module()
 * class AppModule {
 *   @Provides()
 *   databaseClient(): DatabaseClient { return new DatabaseClient() }
 * }
 */
export function Provides(): MethodDecorator_Stage3 {
  return () => {};
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
