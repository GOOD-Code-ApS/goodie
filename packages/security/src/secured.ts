/**
 * Mark a controller or method as requiring authentication.
 *
 * On a class: all routes require authentication (use `@Anonymous()` to exempt).
 * On a method: only that route requires authentication.
 *
 * For controllers, the `SecurityHttpFilter` reads compile-time
 * `DecoratorMetadata` to enforce authentication.
 *
 * For service-layer beans, the `SecurityInterceptor` (AOP) checks
 * the `SecurityContext` (AsyncLocalStorage) for an authenticated principal.
 * AOP wiring is automatic — the transformer discovers the `Secured →
 * SecurityInterceptor` mapping from `beans.json` at build time.
 *
 * This decorator is a compile-time marker (no-op at runtime). The transformer
 * records it in `IRBeanDefinition.decorators` / `methodDecorators` and the
 * hono plugin passes it to `HttpFilterContext` for the security filter.
 *
 * @example
 * ```typescript
 * @Controller('/api/admin')
 * @Secured()
 * class AdminController {
 *   @Get('/users')
 *   listUsers(c: Context) { ... }  // requires auth
 *
 *   @Get('/health')
 *   @Anonymous()
 *   health(c: Context) { ... }     // public
 * }
 *
 * @Singleton()
 * class OrderService {
 *   @Secured()
 *   async placeOrder() { ... }     // requires auth (AOP)
 * }
 * ```
 */
export function Secured(): (target: any, context: any) => void {
  return () => {};
}
