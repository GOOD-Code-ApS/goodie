import { RequestScopeManager } from '@goodie-ts/core';
import {
  Request as HttpRequest,
  Response as HttpResponse,
} from '@goodie-ts/http';
import type { Context, Next, TypedResponse } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';

/**
 * Runtime helpers for generated route wiring.
 *
 * These functions encapsulate all Hono ecosystem API calls so that
 * generated code only depends on stable goodie-ts interfaces.
 * When Hono changes its APIs, we update these
 * helpers — generated code stays unchanged.
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
 * Translate a `Response<T>` from `@goodie-ts/http` to a Hono TypedResponse.
 *
 * Uses a conditional type so union returns like `Response<A> | Response<B>`
 * distribute correctly. Specifies `'json'` format for Hono RPC inference.
 */
export function toHonoResponse<T extends HttpResponse<any>>(
  c: Context,
  result: T,
): T extends HttpResponse<infer U>
  ? TypedResponse<U, StatusCode, 'json'>
  : never;
export function toHonoResponse(
  c: Context,
  result: unknown,
): Response | TypedResponse {
  // Framework-managed Response<T> from @goodie-ts/http
  if (result instanceof HttpResponse) {
    const httpRes = result as HttpResponse<unknown>;
    for (const [key, value] of Object.entries(httpRes.headers)) {
      c.header(key, value as string);
    }
    if (httpRes.body === undefined)
      return c.body(null, httpRes.status as StatusCode);
    return c.json(
      httpRes.body as object,
      httpRes.status as ContentfulStatusCode,
    );
  }
  // Native Response passthrough
  if (result instanceof Response) return result;
  // No return value → 204
  if (result === undefined || result === null) return c.body(null, 204);
  // Plain object → JSON 200
  return c.json(result as object);
}

/**
 * Translate a `Response<T>` from the exception handling pipeline to a
 * Hono Response. Returns native `Response` (not `TypedResponse<T>`) to
 * avoid polluting Hono's RPC type inference on the happy path.
 */
export function toHonoErrorResponse(
  c: Context,
  result: HttpResponse<unknown>,
): Response {
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
