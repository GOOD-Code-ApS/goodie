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
 * This decorator is a compile-time marker (no-op at runtime). The hono plugin
 * uses it to skip auth enforcement on specific routes.
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
  return () => {};
}
