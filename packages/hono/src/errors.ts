/**
 * Thrown when a `@Secured` route is accessed without an authenticated principal.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
