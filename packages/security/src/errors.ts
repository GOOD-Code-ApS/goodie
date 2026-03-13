/**
 * Thrown when a request lacks valid authentication credentials.
 * The SecurityExceptionHandler maps this to HTTP 401.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Thrown when an authenticated principal lacks the required roles.
 * The SecurityExceptionHandler maps this to HTTP 403.
 */
export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
