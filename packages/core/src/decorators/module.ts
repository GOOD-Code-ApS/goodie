export interface ModuleOptions {
  /** Other modules to import (compose). */
  imports?: Array<new (...args: any[]) => any>;
}

/**
 * Marks a class as a DI module. Modules group `@Provides()` factory methods
 * and can import other modules.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Module({ imports: [DatabaseModule] })
 * class AppModule {
 *   @Provides()
 *   dbUrl(): string { return process.env.DATABASE_URL! }
 * }
 */
export function Module(_options: ModuleOptions = {}): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
