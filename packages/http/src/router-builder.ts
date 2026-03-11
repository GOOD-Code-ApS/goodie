import type {
  Handler,
  Middleware,
  TypedHandler,
  TypedMiddleware,
} from './middleware.js';
import type { HttpMethod } from './route-metadata.js';

/**
 * A single route entry — method, path, middleware chain, and handler.
 */
export interface RouteEntry {
  readonly method: HttpMethod;
  readonly path: string;
  readonly middlewares: readonly Middleware[];
  readonly handler: Handler;
}

/**
 * Collects route definitions. Used inside `defineRoutes()` and internally by the Router
 * when converting `@Controller` metadata to route entries.
 *
 * The last argument to each route method is the handler; all preceding arguments are middleware.
 *
 * When a `TypedMiddleware<T>` (e.g. `validated(Dto)`) is passed, the handler
 * parameter is typed as `Request<T>` — no manual cast needed.
 */
export class RouterBuilder {
  private readonly entries: RouteEntry[] = [];

  get(path: string, handler: Handler): this;
  get<T>(path: string, mw: TypedMiddleware<T>, handler: TypedHandler<T>): this;
  get<T>(
    path: string,
    mw1: Middleware,
    mw2: TypedMiddleware<T>,
    handler: TypedHandler<T>,
  ): this;
  get(path: string, ...args: (Middleware | Handler)[]): this;
  get(path: string, ...args: (Middleware | Handler)[]): this {
    return this.addRoute('get', path, args);
  }

  post(path: string, handler: Handler): this;
  post<T>(path: string, mw: TypedMiddleware<T>, handler: TypedHandler<T>): this;
  post<T>(
    path: string,
    mw1: Middleware,
    mw2: TypedMiddleware<T>,
    handler: TypedHandler<T>,
  ): this;
  post(path: string, ...args: (Middleware | Handler)[]): this;
  post(path: string, ...args: (Middleware | Handler)[]): this {
    return this.addRoute('post', path, args);
  }

  put(path: string, handler: Handler): this;
  put<T>(path: string, mw: TypedMiddleware<T>, handler: TypedHandler<T>): this;
  put<T>(
    path: string,
    mw1: Middleware,
    mw2: TypedMiddleware<T>,
    handler: TypedHandler<T>,
  ): this;
  put(path: string, ...args: (Middleware | Handler)[]): this;
  put(path: string, ...args: (Middleware | Handler)[]): this {
    return this.addRoute('put', path, args);
  }

  delete(path: string, handler: Handler): this;
  delete<T>(
    path: string,
    mw: TypedMiddleware<T>,
    handler: TypedHandler<T>,
  ): this;
  delete<T>(
    path: string,
    mw1: Middleware,
    mw2: TypedMiddleware<T>,
    handler: TypedHandler<T>,
  ): this;
  delete(path: string, ...args: (Middleware | Handler)[]): this;
  delete(path: string, ...args: (Middleware | Handler)[]): this {
    return this.addRoute('delete', path, args);
  }

  patch(path: string, handler: Handler): this;
  patch<T>(
    path: string,
    mw: TypedMiddleware<T>,
    handler: TypedHandler<T>,
  ): this;
  patch<T>(
    path: string,
    mw1: Middleware,
    mw2: TypedMiddleware<T>,
    handler: TypedHandler<T>,
  ): this;
  patch(path: string, ...args: (Middleware | Handler)[]): this;
  patch(path: string, ...args: (Middleware | Handler)[]): this {
    return this.addRoute('patch', path, args);
  }

  getEntries(): readonly RouteEntry[] {
    return this.entries;
  }

  private addRoute(
    method: HttpMethod,
    path: string,
    args: (Middleware | Handler)[],
  ): this {
    if (args.length === 0) {
      throw new Error(
        `Route ${method.toUpperCase()} ${path} requires at least a handler`,
      );
    }
    const handler = args[args.length - 1] as Handler;
    const middlewares = args.slice(0, -1) as Middleware[];
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    this.entries.push({ method, path: normalizedPath, middlewares, handler });
    return this;
  }
}
