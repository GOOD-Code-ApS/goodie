export interface FactoryOptions {
  /** Other factories to import (compose). */
  imports?: Array<new (...args: any[]) => any>;
}

/**
 * Marks a class as a DI factory. Factories group `@Provides()` methods
 * and can import other factories.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Factory({ imports: [DatabaseFactory] })
 * class AppFactory {
 *   @Provides()
 *   dbUrl(): string { return process.env.DATABASE_URL! }
 * }
 */
export function Factory(_options: FactoryOptions = {}): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
