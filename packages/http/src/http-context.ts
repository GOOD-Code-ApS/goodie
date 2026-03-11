/**
 * Read-only HTTP request context.
 *
 * Provides access to request metadata (headers, cookies, query params,
 * path params, URL) without carrying the request body. The body is always
 * a separate typed parameter on the controller method.
 *
 * Constructed per-request by the adapter (e.g. Hono). Not a bean —
 * exists only for the duration of a single request handler invocation.
 */
export class HttpContext {
  readonly headers: Headers;
  readonly query: URLSearchParams;
  readonly params: Record<string, string>;
  readonly url: string;

  constructor(options: {
    headers: Headers;
    query?: URLSearchParams;
    params?: Record<string, string>;
    url?: string;
  }) {
    this.headers = options.headers;
    this.query = options.query ?? new URLSearchParams();
    this.params = options.params ?? {};
    this.url = options.url ?? '';
  }

  /** Get a cookie value by name. Returns undefined if not present. */
  cookie(name: string): string | undefined {
    const cookieHeader = this.headers.get('Cookie');
    if (!cookieHeader) return undefined;
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}
