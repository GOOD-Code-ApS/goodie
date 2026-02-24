import type { Scope } from '@goodie-ts/core';
import { META, setMeta } from './metadata.js';

/**
 * Marks a class as injectable with prototype scope.
 *
 * @example
 * @Injectable()
 * class UserRepository { ... }
 */
export function Injectable(): ClassDecorator_Stage3 {
  return (_target, context) => {
    setMeta(context.metadata!, META.SCOPE, 'prototype' satisfies Scope);
  };
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
