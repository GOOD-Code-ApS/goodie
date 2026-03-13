import type { HttpContext } from '@goodie-ts/http';
import type { Principal } from './principal.js';
import { SecurityContext } from './security-context.js';
import type { SecurityProvider } from './security-provider.js';

/**
 * Creates a middleware function that authenticates requests via SecurityProviders.
 *
 * Iterates all registered providers in order. The first provider that returns
 * a Principal wins. If no provider authenticates, the principal is undefined
 * (unauthenticated) — the SecurityInterceptor will throw UnauthorizedError
 * for @Secured methods.
 *
 * The adapter (e.g. hono) is responsible for wiring this into its middleware chain.
 */
export function createSecurityMiddleware(
  providers: SecurityProvider[],
): (request: HttpContext, next: () => Promise<unknown>) => Promise<unknown> {
  return async (request: HttpContext, next: () => Promise<unknown>) => {
    let principal: Principal | undefined;
    for (const provider of providers) {
      principal = await provider.authenticate(request);
      if (principal) break;
    }
    return SecurityContext.run(principal, next);
  };
}
