import type { ApplicationContext } from './application-context.js';

/**
 * Lifecycle interface for components that need to perform actions after the
 * ApplicationContext is fully initialized.
 *
 * Implementations are discovered via `getAll(OnStart)` using the
 * `baseTokens` mechanism. Execution order is controlled by `@Order()`
 * (lower values run first, default is 0).
 *
 * @example
 * ```ts
 * @Singleton()
 * @Order(-10) // runs before default-ordered components
 * class MyStartupComponent extends OnStart {
 *   async onStart(ctx: ApplicationContext): Promise<void> {
 *     // initialization logic
 *   }
 * }
 * ```
 */
export abstract class OnStart {
  abstract onStart(ctx: ApplicationContext): Promise<void>;
}
