import { SECURITY_META } from './metadata.js';

type Decorator_Stage3 =
  | ((
      target: new (...args: any[]) => any,
      context: ClassDecoratorContext,
    ) => void)
  | ((
      target: (...args: never) => unknown,
      context: ClassMethodDecoratorContext,
    ) => void);

/**
 * Mark a controller or method as requiring authentication.
 *
 * On a class: all routes require authentication (use `@Anonymous()` to exempt).
 * On a method: only that route requires authentication.
 *
 * For controllers, the `SecurityHttpFilter` reads this metadata from
 * `Symbol.metadata` at runtime to enforce authentication.
 *
 * For service-layer beans, the `SecurityInterceptor` (AOP) reads
 * the security context set by the filter.
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
export function Secured(): Decorator_Stage3 {
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
