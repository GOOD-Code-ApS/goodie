import type { Context, Hono, Next } from 'hono';
import { cors } from 'hono/cors';
import { describeRoute, openAPIRouteHandler, validator } from 'hono-openapi';
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
  return async (c: Context, next: Next) => {
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
    if (principal) c.set('principal' as never, principal as never);
    return next();
  };
}

/** Create validation middleware for a request body/query/param. */
export function validationMiddleware(
  target: 'json' | 'query' | 'param',
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
            issues: (
              result.error as Array<{ path: string; message: string }>
            ).map((i: { path: string; message: string }) => ({
              path: i.path,
              message: i.message,
            })),
          },
          400,
        );
      }
    }) as never,
  );
}

/** Create OpenAPI describeRoute middleware. */
export function openApiMiddleware(options: Record<string, unknown>) {
  return describeRoute(options as never);
}

/** Mount the OpenAPI JSON spec handler on a router. */
export function mountOpenApiSpec(
  router: Hono,
  config: { title: string; version: string; description?: string },
) {
  (router as any).get(
    '/openapi.json',
    openAPIRouteHandler(router as never, {
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
  return options ? cors(options as never) : cors();
}
