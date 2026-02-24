import type { Scope } from '@goodie-ts/core';
import { META, setMeta } from './metadata.js';

/**
 * Marks a class as a singleton bean.
 *
 * @example
 * @Singleton()
 * class UserService { ... }
 */
export function Singleton(): ClassDecorator_Stage3 {
  return (_target, context) => {
    setMeta(context.metadata!, META.SCOPE, 'singleton' satisfies Scope);
  };
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
