import { RequestScopeManager } from '@goodie-ts/core';
import type { Context, Hono, Next } from 'hono';
import { cors } from 'hono/cors';
import type { DescribeRouteOptions } from 'hono-openapi';
import { describeRoute, openAPIRouteHandler, validator } from 'hono-openapi';
import type { GoodieEnv } from './goodie-env.js';
import type { SecurityProvider } from './security-provider.js';

/**
 * Runtime helpers for generated route wiring.
 *
 * These functions encapsulate all Hono ecosystem API calls so that
 * generated code only depends on stable goodie-ts interfaces.
 * When Hono or hono-openapi change their APIs, we update these
 * helpers — generated code stays unchanged.
 */

/** Convert a controller method's return value to a Hono Response. */
export function handleResult(c: Context, result: unknown): Response {
  if (result instanceof Response) return result;
  if (result === undefined || result === null) return c.body(null, 204);
  return c.json(result as object);
}

/**
 * Create security middleware that authenticates requests.
 * - `'required'`: rejects unauthenticated requests with 401
 * - `'optional'`: attempts auth but allows unauthenticated requests through
 */
export function securityMiddleware(
  securityProvider: SecurityProvider | undefined,
  mode: 'required' | 'optional',
) {
  return async (c: Context<GoodieEnv>, next: Next) => {
    if (!securityProvider) {
      if (mode === 'required') return c.json({ error: 'Unauthorized' }, 401);
      return next();
    }
    const req = {
      headers: { get: (n: string) => c.req.header(n) },
      url: c.req.url,
      method: c.req.method,
    };
    const principal = await securityProvider.authenticate(req);
    if (mode === 'required' && !principal) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (principal) c.set('principal', principal);
    return next();
  };
}

/** Create validation middleware for a request body/query/param. */
export function validationMiddleware(
  target: 'json' | 'query' | 'param',
  // Schema type is StandardSchemaV1 from @standard-schema/spec (transitive dep
  // via hono-openapi), but not a direct dep — so we accept unknown here.
  schema: unknown,
) {
  return validator(
    target,
    schema as never,
    ((result: any, c: any) => {
      if (!result.success) {
        return c.json(
          {
            error: 'Validation failed',
            issues: result.error.map(
              (i: { path: string; message: string }) => ({
                path: i.path,
                message: i.message,
              }),
            ),
          },
          400,
        );
      }
    }) as never,
  );
}

/** Create OpenAPI describeRoute middleware. */
export function openApiMiddleware(options: DescribeRouteOptions) {
  return describeRoute(options);
}

/** Mount the OpenAPI JSON spec handler on a router. */
export function mountOpenApiSpec(
  router: Hono,
  config: { title: string; version: string; description?: string },
) {
  // Cast needed: router's generic schema type is built at compile time
  // via route chaining — unknowable at this runtime abstraction layer.
  (router as any).get(
    '/openapi.json',
    openAPIRouteHandler(router as any, {
      documentation: {
        info: {
          title: config.title,
          version: config.version,
          ...(config.description ? { description: config.description } : {}),
        },
      },
    }),
  );
}

/** Create CORS middleware. */
export function corsMiddleware(options?: Record<string, unknown>) {
  // Cast needed: hono/cors does not export CORSOptions type.
  return options ? cors(options as any) : cors();
}

/** Create request scope middleware — wraps each request in a new RequestScopeManager scope. */
export function requestScopeMiddleware() {
  return async (_c: Context, next: Next) => {
    await RequestScopeManager.run(next);
  };
}
