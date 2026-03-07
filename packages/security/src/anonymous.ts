import { SECURITY_META } from './metadata.js';

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Exempt a route method from class-level `@Secured()`.
 *
 * Only meaningful on methods inside a `@Secured()` controller.
 * When used without class-level `@Secured`, this decorator has no effect.
 *
 * @example
 * ```typescript
 * @Controller('/api')
 * @Secured()
 * class ApiController {
 *   @Get('/data')
 *   getData(c: Context) { ... }  // requires auth
 *
 *   @Get('/health')
 *   @Anonymous()
 *   health(c: Context) { ... }   // public
 * }
 * ```
 */
export function Anonymous(): MethodDecorator_Stage3 {
  return (_target, context) => {
    const methods =
      (context.metadata[SECURITY_META.ANONYMOUS_METHODS] as Set<string>) ??
      new Set<string>();
    methods.add(context.name as string);
    context.metadata[SECURITY_META.ANONYMOUS_METHODS] = methods;
  };
}
