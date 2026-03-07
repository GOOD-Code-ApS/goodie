import type { Principal } from './principal.js';
import type { SecurityContext } from './security-context.js';

/**
 * Retrieve the authenticated principal from the current security context.
 *
 * Can be used in any `@Secured` controller method or downstream service.
 * The principal is set by the generated security middleware and propagated
 * via `AsyncLocalStorage` through the call chain.
 *
 * @param securityContext The SecurityContext bean (inject via constructor)
 * @returns The authenticated principal
 * @throws Error if no principal is set (should not happen in @Secured methods)
 *
 * @example
 * ```typescript
 * @Singleton()
 * class ProfileService {
 *   constructor(private readonly securityContext: SecurityContext) {}
 *
 *   async getProfile() {
 *     const principal = getPrincipal(this.securityContext);
 *     return { name: principal.name };
 *   }
 * }
 * ```
 */
export function getPrincipal<P extends Principal = Principal>(
  securityContext: SecurityContext,
): P {
  const principal = securityContext.getPrincipal<P>();
  if (!principal) {
    throw new Error(
      'No principal in security context. Is this method @Secured?',
    );
  }
  return principal;
}
