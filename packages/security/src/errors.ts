/**
 * Thrown when a `@Secured` method is called without an authenticated principal.
 * The `SecurityHttpFilter` catches this and returns a 401 response.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
