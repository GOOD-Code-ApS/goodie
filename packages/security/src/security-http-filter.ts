import { Inject, Optional, Singleton } from '@goodie-ts/core';
import type { HttpFilterContext } from '@goodie-ts/http';
import { HttpFilter } from '@goodie-ts/http';
import { SECURITY_META } from './metadata.js';
import type { SecurityContext } from './security-context.js';
import type { SecurityProvider, SecurityRequest } from './security-provider.js';
import { SECURITY_PROVIDER } from './security-provider.js';

/**
 * Global HTTP filter that handles authentication and authorization for controllers.
 *
 * Runs early in the middleware chain (order = -1000):
 * 1. Extracts credentials via `SecurityProvider.authenticate()`
 * 2. Checks `@Secured`/`@Anonymous` metadata from `HttpFilterContext.routeMetadata`
 * 3. Returns 401 if the route requires auth and no principal was resolved
 * 4. Stores the principal in `SecurityContext` (AsyncLocalStorage) for downstream use
 *
 * For service-layer `@Secured` methods, the `SecurityInterceptor` (AOP) reads
 * the principal from `SecurityContext`.
 */
@Singleton()
export class SecurityHttpFilter extends HttpFilter {
  order = -1000;

  @Inject(SECURITY_PROVIDER)
  @Optional()
  accessor securityProvider: SecurityProvider | undefined;

  constructor(private readonly securityContext: SecurityContext) {
    super();
  }

  middleware() {
    const provider = this.securityProvider;
    const context = this.securityContext;

    return async (
      ctx: HttpFilterContext,
      next: () => Promise<void>,
    ): Promise<Response | undefined> => {
      // No SecurityProvider registered — skip authentication
      if (!provider) {
        await next();
        return undefined;
      }

      const honoCtx = ctx.request as {
        req: {
          header(name: string): string | undefined;
          url: string;
          method: string;
        };
      };

      const request: SecurityRequest = {
        headers: { get: (name: string) => honoCtx.req.header(name) },
        url: honoCtx.req.url,
        method: honoCtx.req.method,
      };

      // Authentication
      const principal = await provider.authenticate(request);

      // Authorization — check if this route requires auth
      const meta = ctx.routeMetadata;
      const isClassSecured = meta[SECURITY_META.SECURED] === true;
      const securedMethods = meta[SECURITY_META.SECURED_METHODS] as
        | Set<string>
        | undefined;
      const anonymousMethods = meta[SECURITY_META.ANONYMOUS_METHODS] as
        | Set<string>
        | undefined;

      const isMethodSecured = securedMethods?.has(ctx.methodName) ?? false;
      const isAnonymous = anonymousMethods?.has(ctx.methodName) ?? false;
      const needsAuth = (isClassSecured || isMethodSecured) && !isAnonymous;

      if (needsAuth && !principal) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Run downstream in security context (for service-layer @Secured)
      await context.run(principal, () => next());
      return undefined;
    };
  }
}
