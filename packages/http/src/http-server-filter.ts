import type { HttpContext } from './http-context.js';

/**
 * Abstract HTTP server filter. Concrete implementations live in their
 * respective packages (e.g. `SecurityFilter` in `@goodie-ts/security`).
 *
 * Filters are discovered at runtime via `ctx.getAll(HttpServerFilter)` and
 * applied as middleware by adapter packages (e.g. Hono). Use `@Order()` to
 * control execution order.
 *
 * Follows the same pattern as `ExceptionHandler` and `BodyValidator` —
 * abstract class in the HTTP abstraction, concrete implementations via
 * library beans with `baseTokens: [HttpServerFilter]`.
 */
export abstract class HttpServerFilter {
  /**
   * Filter an incoming HTTP request.
   *
   * Call `next()` to proceed to the next filter or the route handler.
   * Return the result of `next()` to pass through, or return early to
   * short-circuit the chain (e.g. for authentication failures).
   *
   * @param request - The incoming HTTP request context
   * @param next - Invokes the next filter or route handler
   * @returns The result of the downstream chain, or a short-circuit response
   */
  abstract doFilter(
    request: HttpContext,
    next: () => Promise<unknown>,
  ): Promise<unknown>;
}
