import { Singleton } from '@goodie-ts/core';
import { ExceptionHandler, Response } from '@goodie-ts/http';
import { ForbiddenError, UnauthorizedError } from './errors.js';

/**
 * Exception handler for security errors.
 *
 * Maps UnauthorizedError to 401 and ForbiddenError to 403.
 * Extends ExceptionHandler from @goodie-ts/http — auto-discovered
 * via baseTokenRefs in the exception handling pipeline.
 */
@Singleton()
export class SecurityExceptionHandler extends ExceptionHandler {
  handle(error: unknown): Response<unknown> | undefined {
    if (error instanceof UnauthorizedError) {
      return Response.status(401, { message: error.message });
    }
    if (error instanceof ForbiddenError) {
      return Response.status(403, { message: error.message });
    }
    return undefined;
  }
}
