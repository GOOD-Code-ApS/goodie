import { Singleton } from '@goodie-ts/core';
import type { HttpContext } from '@goodie-ts/http';
import { HttpServerFilter } from '@goodie-ts/http';
import type { Principal } from './principal.js';
import { SecurityContext } from './security-context.js';
import type { SecurityProvider } from './security-provider.js';

/**
 * HTTP server filter that authenticates requests via SecurityProviders.
 *
 * Registered as a library bean with `baseTokens: [HttpServerFilter]`.
 * The adapter (e.g. Hono) discovers all `HttpServerFilter` beans and
 * applies them as middleware — no adapter-specific security knowledge needed.
 *
 * Iterates all registered SecurityProviders in order. The first provider
 * that returns a Principal wins. If no provider authenticates, the principal
 * is undefined (unauthenticated) — the SecurityInterceptor will throw
 * UnauthorizedError for @Secured methods.
 */
@Singleton()
export class SecurityFilter extends HttpServerFilter {
  constructor(private readonly providers: SecurityProvider[]) {
    super();
  }

  async doFilter(
    request: HttpContext,
    next: () => Promise<unknown>,
  ): Promise<unknown> {
    let principal: Principal | undefined;
    for (const provider of this.providers) {
      principal = await provider.authenticate(request);
      if (principal) break;
    }
    return SecurityContext.run(principal, next);
  }
}
