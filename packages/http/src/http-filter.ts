import { InjectionToken } from '@goodie-ts/core';

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
 *   order = -100;
 *
 *   middleware() {
 *     return async (c: any, next: any) => {
 *       // authentication logic
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
    c: unknown,
    next: () => Promise<void>,
  ) => Promise<Response | undefined>;
}

/** Injection token for discovering all registered HttpFilter beans. */
export const HTTP_FILTER = new InjectionToken<HttpFilter>('HttpFilter');
