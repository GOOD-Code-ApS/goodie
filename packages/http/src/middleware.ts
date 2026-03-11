import type { Request } from './request.js';
import type { Response } from './response.js';

/**
 * Route handler — receives a Request and returns a Response.
 */
export type Handler = (req: Request) => Response | Promise<Response>;

/**
 * Typed route handler — receives a Request with a known body type.
 * Used with `TypedMiddleware<T>` (e.g. `validated(Dto)`) to propagate
 * the body type from middleware to handler.
 */
export type TypedHandler<T> = (req: Request<T>) => Response | Promise<Response>;

/**
 * Middleware — receives a Request and a next function.
 * Call `next()` to continue the chain, or return a Response directly to short-circuit.
 *
 * Middleware is framework-agnostic — it operates on `@goodie-ts/http` Request/Response,
 * never on adapter-specific types (Hono Context, Express req/res, etc.).
 */
export type Middleware = (
  req: Request,
  next: () => Promise<Response>,
) => Promise<Response>;

/**
 * A middleware that carries a phantom body type `T`.
 *
 * When passed to a `RouterBuilder` method, the handler's `Request<T>` is
 * inferred from this type — no manual cast needed.
 *
 * @example
 * ```typescript
 * router.post('/todos', validated(CreateTodoDto), async (req) => {
 *   req.body.title; // typed as CreateTodoDto
 * });
 * ```
 */
export type TypedMiddleware<T> = Middleware & { readonly __bodyType: T };
