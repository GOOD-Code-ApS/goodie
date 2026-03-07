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
 * Library packages (security, logging, etc.) extend this abstract class.
 * The scanner automatically tracks the class hierarchy via `baseTokenRefs`,
 * enabling `ctx.getAll(HttpFilter)` to discover all filter beans.
 *
 * Lower `order` values run first.
 *
 * @example
 * ```typescript
 * @Singleton()
 * class SecurityHttpFilter extends HttpFilter {
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
export abstract class HttpFilter {
  /** Ordering priority. Lower values run first. */
  abstract order: number;

  /** Returns a middleware handler function. */
  abstract middleware(): (
    ctx: HttpFilterContext,
    next: () => Promise<void>,
  ) => Promise<Response | undefined>;
}
