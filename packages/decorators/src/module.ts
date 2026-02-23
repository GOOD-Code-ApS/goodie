import { META, setMeta } from './metadata.js';

export interface ModuleOptions {
  /** Other modules to import (compose). */
  imports?: Array<new (...args: any[]) => any>;
}

/**
 * Marks a class as a DI module. Modules group `@Provides()` factory methods
 * and can import other modules.
 *
 * @example
 * @Module({ imports: [DatabaseModule] })
 * class AppModule {
 *   @Provides()
 *   dbUrl(): string { return process.env.DATABASE_URL! }
 * }
 */
export function Module(options: ModuleOptions = {}): ClassDecorator_Stage3 {
  return (_target, context) => {
    setMeta(context.metadata!, META.MODULE, {
      imports: options.imports ?? [],
    });
  };
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
