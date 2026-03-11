import type { ApplicationContext } from '@goodie-ts/core';
import { ExceptionHandler } from './exception-handler.js';
import type { Handler, Middleware } from './middleware.js';
import type { Request } from './request.js';
import type { Response } from './response.js';
import { RouteDefinition } from './route-definition.js';
import type { ControllerMetadata, RouteMetadata } from './route-metadata.js';
import type { RouteEntry } from './router-builder.js';

/**
 * Abstract HTTP router. Collects routes from both `defineRoutes()` and `@Controller` beans,
 * executes middleware chains, and handles exceptions.
 *
 * The adapter (e.g. `@goodie-ts/hono`) converts between its native request/response
 * types and the Router's `Request`/`Response` at the I/O boundary.
 *
 * @example
 * ```typescript
 * const ctx = await app.start();
 * const router = Router.fromContext(ctx);
 * const hono = adaptRouter(router, ctx);
 * await ctx.get(EmbeddedServer).listen(hono);
 * ```
 */
export class Router {
  private constructor(
    private readonly routes: RouteEntry[],
    private readonly exceptionHandlers: ExceptionHandler[],
  ) {}

  /**
   * Create a Router from an ApplicationContext.
   *
   * Discovers routes from two sources:
   * 1. `RouteDefinition` beans (from `defineRoutes()`)
   * 2. Beans with `metadata.httpController` (from `@Controller`)
   */
  static fromContext(ctx: ApplicationContext): Router {
    const exceptionHandlers = ctx.getAll(ExceptionHandler);
    const routes: RouteEntry[] = [];

    // 1. Discover RouteDefinition beans
    const routeDefinitions = ctx.getAll(RouteDefinition);
    for (const def of routeDefinitions) {
      routes.push(...def.routes);
    }

    // 2. Discover @Controller beans via metadata
    for (const beanDef of ctx.getDefinitions()) {
      const controllerMeta = beanDef.metadata.httpController as
        | ControllerMetadata
        | undefined;
      if (!controllerMeta) continue;

      const controller = ctx.get(beanDef.token);
      for (const route of controllerMeta.routes) {
        routes.push(
          controllerRouteToEntry(controller, controllerMeta.basePath, route),
        );
      }
    }

    return new Router(routes, exceptionHandlers);
  }

  /**
   * All registered route entries. Used by adapters to register routes on the
   * framework-specific router (Hono, Express, etc.).
   */
  getRoutes(): readonly RouteEntry[] {
    return this.routes;
  }

  /**
   * Execute a route's middleware chain and handler for the given request.
   *
   * Exception handlers are applied if the chain throws — the first handler
   * that returns a Response wins. Unhandled errors are rethrown.
   */
  async execute(route: RouteEntry, req: Request): Promise<Response> {
    try {
      return await executeChain(route.middlewares, route.handler, req);
    } catch (e) {
      for (const handler of this.exceptionHandlers) {
        const response = handler.handle(e);
        if (response) return response;
      }
      throw e;
    }
  }
}

/**
 * Run a middleware chain followed by a handler. Koa-style onion model.
 */
async function executeChain(
  middlewares: readonly Middleware[],
  handler: Handler,
  req: Request,
): Promise<Response> {
  let index = 0;

  const next = async (): Promise<Response> => {
    if (index < middlewares.length) {
      const mw = middlewares[index++];
      return mw(req, next);
    }
    const result = handler(req);
    return result instanceof Promise ? result : Promise.resolve(result);
  };

  return next();
}

/**
 * Convert a `@Controller` route to a RouteEntry.
 */
function controllerRouteToEntry(
  controller: unknown,
  basePath: string,
  route: RouteMetadata,
): RouteEntry {
  const method = (
    controller as Record<string, (...args: unknown[]) => unknown>
  )[route.methodName];

  const routePath = route.path.startsWith('/') ? route.path : `/${route.path}`;
  let path: string;
  if (routePath === '/') {
    // Root route — use base path without trailing slash
    path = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    if (!path) path = '/';
  } else if (basePath.endsWith('/') && routePath.startsWith('/')) {
    path = basePath + routePath.slice(1);
  } else {
    path = basePath + routePath;
  }

  return {
    method: route.httpMethod,
    path,
    middlewares: [],
    handler: async (req) => {
      if (route.hasRequestParam) {
        return (await method.call(controller, req)) as Response;
      }
      return (await method.call(controller)) as Response;
    },
  };
}
