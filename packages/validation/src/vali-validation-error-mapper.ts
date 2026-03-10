import { Singleton } from '@goodie-ts/core';
import { Response, ValidationErrorMapper } from '@goodie-ts/http';
import { ValiError } from 'valibot';

/**
 * Concrete validation error mapper that handles Valibot's `ValiError`.
 *
 * Library bean — extends `ValidationErrorMapper` from `@goodie-ts/http`.
 * The DI container resolves this as the concrete implementation.
 * The Hono adapter references the abstract type only — no coupling
 * between hono and valibot.
 */
@Singleton()
export class ValiValidationErrorMapper extends ValidationErrorMapper {
  tryMap(error: unknown): Response<unknown> | undefined {
    if (error instanceof ValiError) {
      return Response.status(400, {
        errors: error.issues.map((issue) => ({
          path: issue.path?.map((p) => p.key).join('.'),
          message: issue.message,
        })),
      });
    }
    return undefined;
  }
}
