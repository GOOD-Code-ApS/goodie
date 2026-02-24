import type { InjectionToken } from '@goodie-ts/core';
import { META, pushMeta } from './metadata.js';

/**
 * Accessor decorator to inject a dependency by qualifier name or InjectionToken.
 *
 * Note: Native Stage 3 decorators don't support parameter decorators.
 * Use `@Inject` on auto-accessor fields only. Constructor parameter injection
 * is handled by the Phase 2 transformer via AST analysis.
 *
 * @example
 * @Singleton()
 * class UserService {
 *   @Inject('primary') accessor repo!: UserRepository
 *   @Inject(DB_URL) accessor url!: string
 * }
 */
export function Inject(
  qualifier: string | InjectionToken<unknown>,
): (
  target: ClassAccessorDecoratorTarget<unknown, unknown>,
  context: ClassAccessorDecoratorContext,
) => void {
  return (_target, context) => {
    pushMeta(context.metadata!, META.INJECT, {
      fieldName: context.name,
      qualifier,
    });
  };
}
