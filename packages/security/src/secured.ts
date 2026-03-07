import { SECURITY_META } from './metadata.js';

/**
 * Mark a controller or method as requiring authentication.
 *
 * On a class: all routes require authentication (use `@Anonymous()` to exempt).
 * On a method: only that route requires authentication.
 *
 * For controllers, the `SecurityHttpFilter` reads this metadata from
 * `Symbol.metadata` at runtime to enforce authentication.
 *
 * For service-layer beans, the `SecurityInterceptor` (AOP) checks
 * the `SecurityContext` (AsyncLocalStorage) for an authenticated principal.
 * AOP wiring is automatic — the transformer discovers the `Secured →
 * SecurityInterceptor` mapping from `beans.json` at build time.
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
  return (
    _target: any,
    context: ClassDecoratorContext | ClassMethodDecoratorContext,
  ) => {
    if (context.kind === 'class') {
      context.metadata[SECURITY_META.SECURED] = true;
    } else if (context.kind === 'method') {
      const methods =
        (context.metadata[SECURITY_META.SECURED_METHODS] as Set<string>) ??
        new Set<string>();
      methods.add(context.name as string);
      context.metadata[SECURITY_META.SECURED_METHODS] = methods;
    }
  };
}
