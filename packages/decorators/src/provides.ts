import { META, pushMeta } from './metadata.js';

/**
 * Marks a method inside a `@Module()` class as a bean factory.
 *
 * @example
 * @Module()
 * class AppModule {
 *   @Provides()
 *   databaseClient(): DatabaseClient { return new DatabaseClient() }
 * }
 */
export function Provides(): MethodDecorator_Stage3 {
  return (_target, context) => {
    pushMeta(context.metadata!, META.PROVIDES, {
      methodName: context.name,
    });
  };
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
