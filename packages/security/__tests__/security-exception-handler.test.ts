import { describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../src/errors.js';
import { SecurityExceptionHandler } from '../src/security-exception-handler.js';

describe('SecurityExceptionHandler', () => {
  const handler = new SecurityExceptionHandler();

  it('maps UnauthorizedError to 401', () => {
    const response = handler.handle(new UnauthorizedError());
    expect(response).toBeDefined();
    expect(response!.status).toBe(401);
    expect(response!.body).toEqual({ message: 'Unauthorized' });
  });

  it('maps ForbiddenError to 403', () => {
    const response = handler.handle(
      new ForbiddenError('Not enough privileges'),
    );
    expect(response).toBeDefined();
    expect(response!.status).toBe(403);
    expect(response!.body).toEqual({ message: 'Not enough privileges' });
  });

  it('returns undefined for unknown errors', () => {
    const response = handler.handle(new Error('something else'));
    expect(response).toBeUndefined();
  });

  it('returns undefined for non-Error values', () => {
    const response = handler.handle('string error');
    expect(response).toBeUndefined();
  });
});
