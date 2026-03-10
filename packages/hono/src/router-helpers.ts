import { RequestScopeManager } from '@goodie-ts/core';
import {
  Request as HttpRequest,
  Response as HttpResponse,
  type ValidationErrorMapper,
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

/** Convert a controller method's return value to a Hono Response. */
export function handleResult<T extends HttpResponse<any>>(
  c: Context,
  result: T,
): T extends HttpResponse<infer U> ? TypedResponse<U, StatusCode> : never;
export function handleResult(c: Context, result: unknown): Response;
export function handleResult(
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

/**
 * Handle errors in route handlers. If a `ValidationErrorMapper` is provided,
 * tries to map the error to a validation response (400). Otherwise re-throws.
 */
export function handleError(
  c: Context,
  error: unknown,
  errorMapper: ValidationErrorMapper,
): Response {
  const mapped = errorMapper.tryMap(error);
  if (mapped) {
    for (const [key, value] of Object.entries(mapped.headers)) {
      c.header(key, value as string);
    }
    if (mapped.body === undefined)
      return c.body(null, mapped.status as StatusCode);
    return c.json(mapped.body as object, mapped.status as ContentfulStatusCode);
  }
  throw error;
}
