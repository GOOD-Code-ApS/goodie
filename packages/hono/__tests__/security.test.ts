import { describe, expect, it } from 'vitest';
import { Anonymous } from '../src/anonymous.js';
import { UnauthorizedError } from '../src/errors.js';
import { Secured } from '../src/secured.js';

describe('UnauthorizedError', () => {
  it('has correct name and default message', () => {
    const error = new UnauthorizedError();
    expect(error.name).toBe('UnauthorizedError');
    expect(error.message).toBe('Authentication required');
  });

  it('accepts custom message', () => {
    const error = new UnauthorizedError('Custom message');
    expect(error.message).toBe('Custom message');
  });
});

describe('@Secured / @Anonymous decorators', () => {
  it('@Secured is a no-op at runtime (compile-time marker)', () => {
    const decorator = Secured();
    // Should not throw — it's a no-op
    expect(() => decorator(class {}, {} as any)).not.toThrow();
  });

  it('@Anonymous is a no-op at runtime (compile-time marker)', () => {
    const decorator = Anonymous();
    expect(() => decorator(() => {}, {} as any)).not.toThrow();
  });
});
