/**
 * Accessor decorator marking a dependency as optional.
 * If no provider is registered, the field resolves to `undefined`.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Singleton()
 * class MetricsService {
 *   @Optional() accessor tracer: Tracer | undefined
 * }
 */
export function Optional(): (
  target: ClassAccessorDecoratorTarget<unknown, unknown>,
  context: ClassAccessorDecoratorContext,
) => void {
  return () => {};
}
