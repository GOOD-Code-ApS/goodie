import { InjectionToken } from '@goodie-ts/core';

/**
 * Context passed to HTTP filter middleware.
 *
 * The runtime plugin (e.g. Hono) populates this with the framework-specific
 * request and the matched route's decorator metadata. Filters can read route
 * metadata to make per-route decisions (e.g. security checks) without coupling
 * to the specific decorator package.
 */
export interface HttpFilterContext {
  /** Framework-specific request/context object (e.g. Hono's `Context`). */
  request: unknown;

  /**
   * Decorator metadata from the matched controller class (`Symbol.metadata`).
   * Contains entries written by any decorator on the controller or its methods.
   */
  routeMetadata: Record<symbol, unknown>;

  /** The name of the matched controller method. */
  methodName: string;
}

/**
 * An HTTP filter that contributes middleware to the generated router.
 *
 * Library packages (security, logging, etc.) can register `HttpFilter` beans
 * with `baseTokens: [HTTP_FILTER]`. The HTTP runtime plugin (e.g. Hono) discovers
 * all `HttpFilter` beans and applies them as middleware, sorted by `order`.
 *
 * Lower `order` values run first.
 *
 * @example
 * ```typescript
 * @Singleton()
 * class SecurityHttpFilter implements HttpFilter {
 *   order = -1000;
 *
 *   middleware() {
 *     return async (ctx: HttpFilterContext, next: () => Promise<void>) => {
 *       // Read route metadata to check if auth is required
 *       const isSecured = ctx.routeMetadata[SECURITY_META.SECURED];
 *       // ...
 *       await next();
 *     };
 *   }
 * }
 * ```
 */
export interface HttpFilter {
  /** Ordering priority. Lower values run first. */
  order: number;

  /** Returns a middleware handler function. */
  middleware(): (
    ctx: HttpFilterContext,
    next: () => Promise<void>,
  ) => Promise<Response | undefined>;
}

/** Injection token for discovering all registered HttpFilter beans. */
export const HTTP_FILTER = new InjectionToken<HttpFilter>('HttpFilter');
