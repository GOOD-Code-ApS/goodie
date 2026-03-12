import { Singleton } from '@goodie-ts/core';
import { ExceptionHandler, Response } from '@goodie-ts/http';
import { ValiError } from 'valibot';

/**
 * Exception handler for Valibot's `ValiError`.
 *
 * Library bean — extends `ExceptionHandler` from `@goodie-ts/http`.
 * The generic exception handling pipeline iterates all registered
 * `ExceptionHandler` beans. This one catches `ValiError` and returns
 * a 400 Bad Request with structured error details.
 */
@Singleton()
export class ValiExceptionHandler extends ExceptionHandler {
  handle(error: unknown): Response<unknown> | undefined {
    if (error instanceof ValiError) {
      return Response.status(400, {
        errors: error.issues.map((issue) => ({
          path:
            issue.path
              ?.map((p: { key: string | number | symbol }) => p.key)
              .join('.') ?? '',
          message: issue.message,
        })),
      });
    }
    return undefined;
  }
}
