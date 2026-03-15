import type { HttpContext } from './http-context.js';

/**
 * Abstract HTTP server filter. Concrete implementations live in their
 * respective packages (e.g. `SecurityFilter` in `@goodie-ts/security`).
 *
 * Filters are discovered at runtime via `ctx.getAll(HttpServerFilter)` and
 * applied as middleware by adapter packages (e.g. Hono). Use `@Order()` to
 * control execution order (lower values run first).
 *
 * Override `patterns` to restrict which routes the filter applies to.
 * Default is `['/**']` (all routes). Uses ANT-style pattern matching:
 * - `/api/**` — matches `/api/todos`, `/api/todos/1`, etc.
 * - `/api/*` — matches `/api/todos` but not `/api/todos/1`
 * - `/health` — exact match only
 *
 * Follows the same pattern as `ExceptionHandler` and `BodyValidator` —
 * abstract class in the HTTP abstraction, concrete implementations via
 * library components with `baseTokens: [HttpServerFilter]`.
 */
export abstract class HttpServerFilter {
  /**
   * URL patterns this filter should match. ANT-style glob patterns.
   * Default: `['/**']` (all routes).
   *
   * Examples:
   * - `['/api/**']` — all routes under /api
   * - `['/api/*', '/admin/*']` — single-segment wildcard on multiple prefixes
   * - `['/health']` — exact match
   */
  get patterns(): string[] {
    return ['/**'];
  }

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

/**
 * Convert an ANT-style pattern to a regex for matching request paths.
 *
 * - `/**` → matches everything (any depth)
 * - `/*` → matches a single path segment
 * - Exact paths match exactly
 */
export function matchesPattern(path: string, pattern: string): boolean {
  if (pattern === '/**') return true;

  // Convert ANT pattern to regex
  const regexStr = pattern
    .replace(/\*\*/g, '§GLOBSTAR§')
    .replace(/\*/g, '[^/]+')
    .replace(/§GLOBSTAR§/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

/**
 * Check if a request path matches any of the filter's patterns.
 */
export function filterMatchesPath(
  filter: HttpServerFilter,
  path: string,
): boolean {
  return filter.patterns.some((pattern) => matchesPattern(path, pattern));
}
