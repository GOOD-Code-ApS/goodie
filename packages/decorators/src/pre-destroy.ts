import { META, pushMeta } from './metadata.js';

/**
 * Marks a method to be called when the ApplicationContext is closed.
 *
 * Only effective on `@Singleton` / `@Injectable` classes. The method
 * will be invoked during `close()` in reverse-topological order
 * (dependents destroyed before their dependencies).
 *
 * @example
 * @Singleton()
 * class DatabasePool {
 *   @PreDestroy()
 *   async shutdown() {
 *     await this.pool.end();
 *   }
 * }
 */
export function PreDestroy(): MethodDecorator_Stage3 {
  return (_target, context) => {
    pushMeta(context.metadata!, META.PRE_DESTROY, {
      methodName: context.name,
    });
  };
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
