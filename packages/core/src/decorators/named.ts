import { META, setMeta } from './metadata.js';

/**
 * Assigns a qualifier name to a bean, used for disambiguation
 * when multiple implementations exist for the same type.
 *
 * @example
 * @Named('primary')
 * @Singleton()
 * class PrimaryUserRepository implements UserRepository { ... }
 */
export function Named(name: string): ClassDecorator_Stage3 {
  return (_target, context) => {
    setMeta(context.metadata!, META.NAME, name);
  };
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
