import { META, pushMeta } from './metadata.js';

/**
 * Accessor decorator marking a dependency as optional.
 * If no provider is registered, the field resolves to `undefined`.
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
  return (_target, context) => {
    pushMeta(context.metadata!, META.OPTIONAL, {
      fieldName: context.name,
    });
  };
}
