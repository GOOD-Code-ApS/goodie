import { META, setMeta } from './metadata.js';

/**
 * Marks a singleton bean for eager instantiation during context creation.
 * By default, singletons are lazy (created on first `get()`).
 *
 * @example
 * @Eager()
 * @Singleton()
 * class StartupService { ... }
 */
export function Eager(): ClassDecorator_Stage3 {
  return (_target, context) => {
    setMeta(context.metadata!, META.EAGER, true);
  };
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
