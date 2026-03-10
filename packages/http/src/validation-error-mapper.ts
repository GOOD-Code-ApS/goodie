import type { Response } from './response.js';

/**
 * Abstract validation error mapper. Concrete implementations live in
 * their respective validation packages (e.g. `ValiValidationErrorMapper`
 * in `@goodie-ts/validation`).
 *
 * The adapter (e.g. Hono) catches errors in route handlers and calls
 * `tryMap()` to convert validation errors to HTTP responses.
 */
export abstract class ValidationErrorMapper {
  abstract tryMap(error: unknown): Response<unknown> | undefined;
}
