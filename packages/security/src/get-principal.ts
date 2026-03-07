import type { Principal } from './principal.js';
import type { SecurityContext } from './security-context.js';

/**
 * Retrieve the authenticated principal from the current security context.
 *
 * Can be used in any `@Secured` method — controllers, services, etc.
 * The principal is set by the `SecurityHttpFilter` and propagated via
 * `AsyncLocalStorage` through the call chain.
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
 *   @Secured()
 *   async getProfile() {
 *     const principal = this.securityContext.getPrincipal();
 *     return { name: principal!.name };
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
