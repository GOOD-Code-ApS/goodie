import type { ApplicationContext } from '@goodie-ts/core';
import type {
  ControllerMetadata,
  HttpMethod,
  RouteMetadata,
} from '@goodie-ts/http';
import {
  ExceptionHandler,
  handleException,
  MappedException,
} from '@goodie-ts/http';
import { Hono } from 'hono';

import {
  buildRequest,
  corsMiddleware,
  requestScopeMiddleware,
  toHonoErrorResponse,
  toHonoResponse,
} from './router-helpers.js';
import type { CorsConfig } from './server-config.js';
import { ServerConfig } from './server-config.js';

/**
 * Create a Hono router from an ApplicationContext.
 *
 * Discovers all controller beans via `metadata.httpController` on bean
 * definitions, resolves them from the context, and registers their routes
 * on a Hono instance. Exception handlers, CORS, and request-scoped bean
 * middleware are wired automatically.
 *
 * This is the runtime equivalent of what the hono codegen plugin previously
 * generated — no code generation needed.
 *
 * @deprecated Use `Router.fromContext(ctx)` + `adaptRouter()` instead,
 * or just `await app.start()` which auto-starts the `HonoEmbeddedServer`.
 */
export function createHonoRouter(ctx: ApplicationContext): Hono {
  const exceptionHandlers = ctx.getAll(ExceptionHandler);
  const definitions = ctx.getDefinitions();

  const hasRequestScoped = definitions.some((d) => d.scope === 'request');

  const router = new Hono();

  // Global error handler — catches MappedException from exception handler pipeline
  router.onError((e, c) => {
    if (e instanceof MappedException) {
      return toHonoErrorResponse(c, e.response);
    }
    throw e;
  });

  // Request scope middleware — only if any bean is request-scoped
  if (hasRequestScoped) {
    router.use('*', requestScopeMiddleware());
  }

  // CORS middleware — only if ServerConfig has CORS config
  const serverConfig = resolveServerConfig(ctx);
  if (serverConfig && hasCorsEntries(serverConfig.cors)) {
    router.use('*', corsMiddleware(toCorsOptions(serverConfig.cors)));
  }

  // Register controller routes
  for (const def of definitions) {
    const controllerMeta = def.metadata.httpController as
      | ControllerMetadata
      | undefined;
    if (!controllerMeta) continue;

    const controller = ctx.get(def.token);
    const controllerRoutes = createControllerRoutes(
      controller,
      controllerMeta,
      exceptionHandlers,
    );
    router.route(controllerMeta.basePath, controllerRoutes);
  }

  return router;
}

/**
 * Build a Hono sub-app for a single controller's routes.
 */
function createControllerRoutes(
  controller: unknown,
  metadata: ControllerMetadata,
  exceptionHandlers: ExceptionHandler[],
): Hono {
  const app = new Hono();

  for (const route of metadata.routes) {
    const path = route.path.startsWith('/') ? route.path : `/${route.path}`;
    const handler = createRouteHandler(controller, route, exceptionHandlers);

    registerRoute(app, route.httpMethod, path, handler);
  }

  return app;
}

/**
 * Create an async Hono handler for a single route.
 */
function createRouteHandler(
  controller: unknown,
  route: RouteMetadata,
  exceptionHandlers: ExceptionHandler[],
) {
  const method = (
    controller as Record<string, (...args: unknown[]) => unknown>
  )[route.methodName];
  const hasBody = ['post', 'put', 'patch'].includes(route.httpMethod);

  return async (c: import('hono').Context) => {
    try {
      let result: unknown;
      if (route.hasRequestParam) {
        const req = await buildRequest(c, hasBody);
        result = await method.call(controller, req);
      } else {
        result = await method.call(controller);
      }
      return toHonoResponse(c, result as import('@goodie-ts/http').Response);
    } catch (e) {
      handleException(e as Error, exceptionHandlers);
      throw e;
    }
  };
}

/**
 * Register a handler on a Hono app for the given HTTP method.
 */
function registerRoute(
  app: Hono,
  httpMethod: HttpMethod,
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: any,
): void {
  switch (httpMethod) {
    case 'get':
      app.get(path, handler);
      break;
    case 'post':
      app.post(path, handler);
      break;
    case 'put':
      app.put(path, handler);
      break;
    case 'delete':
      app.delete(path, handler);
      break;
    case 'patch':
      app.patch(path, handler);
      break;
  }
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
