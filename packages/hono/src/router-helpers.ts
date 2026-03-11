import { RequestScopeManager } from '@goodie-ts/core';
import {
  Request as HttpRequest,
  Response as HttpResponse,
} from '@goodie-ts/http';
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';

/**
 * Runtime helpers for route wiring.
 *
 * These functions encapsulate all Hono ecosystem API calls so that
 * `createHonoRouter` only depends on stable goodie-ts interfaces.
 * When Hono changes its APIs, we update these helpers.
 */

/** Construct a Request<T> from a Hono Context. */
export async function buildRequest<T>(
  c: Context,
  parseBody: boolean,
): Promise<HttpRequest<T>> {
  const body = parseBody ? await c.req.json<T>() : (undefined as T);
  return new HttpRequest<T>({
    body,
    headers: c.req.raw.headers,
    query: new URLSearchParams(c.req.query()),
    params: c.req.param() as Record<string, string>,
  });
}

/**
 * Translate a `Response` from `@goodie-ts/http` to a Hono Response.
 */
export function toHonoResponse(
  c: Context,
  result: unknown,
): globalThis.Response {
  // Framework-managed Response from @goodie-ts/http
  if (result instanceof HttpResponse) {
    for (const [key, value] of Object.entries(result.headers)) {
      c.header(key, value as string);
    }
    if (result.body === undefined)
      return c.body(null, result.status as StatusCode);
    return c.json(result.body as object, result.status as ContentfulStatusCode);
  }
  // Native Response passthrough
  if (result instanceof Response) return result;
  // No return value → 204
  if (result === undefined || result === null) return c.body(null, 204);
  // Plain object → JSON 200
  return c.json(result as object);
}

/**
 * Translate a `Response` from the exception handling pipeline to a
 * Hono Response.
 */
export function toHonoErrorResponse(
  c: Context,
  result: HttpResponse,
): globalThis.Response {
  for (const [key, value] of Object.entries(result.headers)) {
    c.header(key, value as string);
  }
  if (result.body === undefined)
    return c.body(null, result.status as StatusCode);
  return c.json(result.body as object, result.status as ContentfulStatusCode);
}

/** Create CORS middleware. */
export function corsMiddleware(options?: Record<string, unknown>) {
  // Cast needed: hono/cors does not export CORSOptions type.
  return options ? cors(options as any) : cors();
}

/** Create request scope middleware — wraps each request in a new RequestScopeManager scope. */
export function requestScopeMiddleware() {
  return async (c: Context, next: Next) => {
    await RequestScopeManager.run(next, c.env as Record<string, unknown>);
  };
}
