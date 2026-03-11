import type { ApplicationContext } from '@goodie-ts/core';
import type { Response as HttpResponse, Router } from '@goodie-ts/http';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';

import {
  buildRequest,
  corsMiddleware,
  requestScopeMiddleware,
} from './router-helpers.js';
import type { CorsConfig } from './server-config.js';
import { ServerConfig } from './server-config.js';

/**
 * Adapt an abstract `Router` from `@goodie-ts/http` to a Hono instance.
 *
 * This is a thin I/O bridge — it converts between Hono's native request/response
 * types and the framework's `Request`/`Response` at the boundary. All middleware
 * chain execution and exception handling happens inside the Router.
 *
 * CORS and request-scope middleware are applied at the Hono level since they
 * require adapter-specific APIs.
 *
 * @example
 * ```typescript
 * // Manual setup (e.g. Cloudflare Workers)
 * const ctx = await createContext();
 * const router = Router.fromContext(ctx);
 * export default adaptRouter(router, ctx);
 * ```
 */
export function adaptRouter(router: Router, ctx: ApplicationContext): Hono {
  const definitions = ctx.getDefinitions();
  const hasRequestScoped = definitions.some((d) => d.scope === 'request');

  const hono = new Hono();

  // Request scope middleware — only if any bean is request-scoped
  if (hasRequestScoped) {
    hono.use('*', requestScopeMiddleware());
  }

  // CORS middleware — only if ServerConfig has CORS config
  const serverConfig = resolveServerConfig(ctx);
  if (serverConfig && hasCorsEntries(serverConfig.cors)) {
    hono.use('*', corsMiddleware(toCorsOptions(serverConfig.cors)));
  }

  // Register routes — Hono handles path matching, Router handles the chain
  for (const route of router.getRoutes()) {
    const hasBody = ['post', 'put', 'patch'].includes(route.method);

    hono[route.method](route.path, async (c) => {
      const req = await buildRequest(c, hasBody);
      const res = await router.execute(route, req);
      return toHonoResponse(c, res);
    });
  }

  return hono;
}

/**
 * Translate a `Response` from `@goodie-ts/http` to a Hono Response.
 */
function toHonoResponse(c: Context, result: HttpResponse): globalThis.Response {
  for (const [key, value] of Object.entries(result.headers)) {
    c.header(key, value as string);
  }
  if (result.body === undefined)
    return c.body(null, result.status as StatusCode);
  return c.json(result.body as object, result.status as ContentfulStatusCode);
}

/**
 * Try to resolve ServerConfig from the context. Returns undefined if not registered.
 */
function resolveServerConfig(
  ctx: ApplicationContext,
): ServerConfig | undefined {
  try {
    return ctx.get(ServerConfig);
  } catch {
    return undefined;
  }
}

/** Check if a CorsConfig has any actual entries. */
function hasCorsEntries(cors: CorsConfig): boolean {
  return (
    cors.origin !== undefined ||
    cors.allowMethods !== undefined ||
    cors.allowHeaders !== undefined ||
    cors.exposeHeaders !== undefined ||
    cors.maxAge !== undefined ||
    cors.credentials !== undefined
  );
}

/** Convert CorsConfig to the options object expected by hono/cors. */
function toCorsOptions(cors: CorsConfig): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (cors.origin !== undefined) options.origin = cors.origin;
  if (cors.allowMethods !== undefined) options.allowMethods = cors.allowMethods;
  if (cors.allowHeaders !== undefined) options.allowHeaders = cors.allowHeaders;
  if (cors.exposeHeaders !== undefined)
    options.exposeHeaders = cors.exposeHeaders;
  if (cors.maxAge !== undefined) options.maxAge = cors.maxAge;
  if (cors.credentials !== undefined) options.credentials = cors.credentials;
  return options;
}
