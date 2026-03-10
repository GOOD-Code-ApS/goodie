import { RequestScopeManager } from '@goodie-ts/core';
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';

/**
 * Runtime helpers for generated route wiring.
 *
 * These functions encapsulate all Hono ecosystem API calls so that
 * generated code only depends on stable goodie-ts interfaces.
 * When Hono changes its APIs, we update these
 * helpers — generated code stays unchanged.
 */

/** Convert a controller method's return value to a Hono Response. */
export function handleResult(
  c: Context,
  result: unknown,
): Response | Promise<Response> {
  if (result instanceof Response) return result;
  if (result === undefined || result === null) return c.body(null, 204);
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
