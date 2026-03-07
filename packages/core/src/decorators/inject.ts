import type { InjectionToken } from '../injection-token.js';

/**
 * Accessor decorator to inject a dependency by qualifier name or InjectionToken.
 *
 * Note: Native Stage 3 decorators don't support parameter decorators.
 * Use `@Inject` on auto-accessor fields only. Constructor parameter injection
 * is handled by the Phase 2 transformer via AST analysis.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Singleton()
 * class UserService {
 *   @Inject('primary') accessor repo!: UserRepository
 *   @Inject(DB_URL) accessor url!: string
 * }
 */
export function Inject(
  _qualifier: string | InjectionToken<unknown>,
): (
  target: ClassAccessorDecoratorTarget<unknown, unknown>,
  context: ClassAccessorDecoratorContext,
) => void {
  return () => {};
}
