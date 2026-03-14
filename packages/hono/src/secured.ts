/**
 * Mark a controller or method as requiring authentication.
 *
 * On a class: all routes require authentication (use `@Anonymous()` to exempt).
 * On a method: only that route requires authentication.
 *
 * The hono plugin generates security middleware directly in the route factory
 * to enforce authentication via the user-provided `SecurityProvider`.
 *
 * This decorator is a compile-time marker (no-op at runtime). The transformer
 * records it in `IRComponentDefinition.decorators` / `methodDecorators` and the
 * hono plugin uses it to decide which routes need auth middleware.
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
 * ```
 */
export function Secured(): (target: any, context: any) => void {
  return () => {};
}
