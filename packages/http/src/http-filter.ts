import type { DecoratorEntry } from '@goodie-ts/core';

/**
 * Context passed to HTTP filter middleware.
 *
 * The runtime plugin (e.g. Hono) populates this with the framework-specific
 * request and the matched route's compile-time decorator metadata. Filters can
 * read decorator metadata to make per-route decisions (e.g. security checks)
 * without coupling to the specific decorator package.
 */
export interface HttpFilterContext {
  /** Framework-specific request/context object (e.g. Hono's `Context`). */
  request: unknown;

  /** The name of the matched controller method. */
  methodName: string;

  /** Decorators on the controller class (compile-time metadata). */
  classDecorators: DecoratorEntry[];

  /** Decorators on the matched method (compile-time metadata). */
  methodDecorators: DecoratorEntry[];
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
 *       // Read decorator metadata to check if auth is required
 *       const isSecured = ctx.classDecorators.some(d => d.name === 'Secured');
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
