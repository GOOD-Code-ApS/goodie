import type { Response } from './response.js';

/**
 * Abstract exception handler. Concrete implementations live in their
 * respective packages (e.g. `ValiExceptionHandler` in `@goodie-ts/validation`).
 *
 * Multiple handlers can be registered — the exception handling pipeline
 * iterates all handlers and uses the first match. This follows Micronaut's
 * `ExceptionHandler<T, R>` pattern.
 */
export abstract class ExceptionHandler {
  abstract handle(error: unknown): Response<unknown> | undefined;
}

/**
 * Wraps a `Response<T>` from the exception handling pipeline so it can
 * be thrown (not returned) from route handlers. This prevents the error
 * response from polluting the handler's return type — adapters catch
 * `MappedException` in a global error handler and translate the response.
 */
export class MappedException extends Error {
  constructor(public readonly response: Response<unknown>) {
    super('Mapped exception');
  }
}

/**
 * Run the exception handling pipeline. If a handler matches, throws a
 * `MappedException` carrying the response. If no handler matches, does
 * nothing — the caller should re-throw the original error.
 *
 * Throwing instead of returning keeps route handler return types clean
 * for frameworks (like Hono) that infer RPC types from return values.
 */
export function handleException(
  error: unknown,
  handlers: ExceptionHandler[],
): void {
  for (const handler of handlers) {
    const mapped = handler.handle(error);
    if (mapped) throw new MappedException(mapped);
  }
}
