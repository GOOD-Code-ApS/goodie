import type { InvocationContext } from '@goodie-ts/core';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../src/errors.js';
import type { Principal } from '../src/principal.js';
import { SecurityContext } from '../src/security-context.js';
import { SecurityInterceptor } from '../src/security-interceptor.js';

function makeCtx(
  metadata?: Record<string, unknown>,
  returnValue: unknown = 'ok',
): InvocationContext {
  return {
    className: 'TestService',
    methodName: 'doSomething',
    args: [],
    target: {},
    proceed: () => returnValue,
    metadata,
  };
}

describe('SecurityInterceptor', () => {
  const interceptor = new SecurityInterceptor();

  it('throws UnauthorizedError when no principal is set', async () => {
    const ctx = makeCtx();
    // No SecurityContext.run() — principal is undefined
    expect(() => interceptor.intercept(ctx)).toThrow(UnauthorizedError);
  });

  it('allows access when principal exists and no roles required', async () => {
    const principal: Principal = {
      name: 'alice',
      roles: [],
      attributes: {},
    };

    const result = await SecurityContext.run(principal, () =>
      interceptor.intercept(makeCtx()),
    );
    expect(result).toBe('ok');
  });

  it('allows access when principal has required role', async () => {
    const principal: Principal = {
      name: 'alice',
      roles: ['ADMIN'],
      attributes: {},
    };

    const result = await SecurityContext.run(principal, () =>
      interceptor.intercept(makeCtx({ roles: 'ADMIN' })),
    );
    expect(result).toBe('ok');
  });

  it('allows access when principal has one of required roles', async () => {
    const principal: Principal = {
      name: 'alice',
      roles: ['EDITOR'],
      attributes: {},
    };

    const result = await SecurityContext.run(principal, () =>
      interceptor.intercept(makeCtx({ roles: ['ADMIN', 'EDITOR'] })),
    );
    expect(result).toBe('ok');
  });

  it('throws ForbiddenError when principal lacks required role', async () => {
    const principal: Principal = {
      name: 'alice',
      roles: ['USER'],
      attributes: {},
    };

    await SecurityContext.run(principal, () => {
      expect(() => interceptor.intercept(makeCtx({ roles: 'ADMIN' }))).toThrow(
        ForbiddenError,
      );
    });
  });

  it('skips auth for @Anonymous methods (anonymous: true metadata)', () => {
    // @Anonymous methods should bypass all auth — no principal needed
    const ctx = makeCtx({ anonymous: true });
    const result = interceptor.intercept(ctx);
    expect(result).toBe('ok');
  });

  it('skips auth for @Anonymous even when roles are set', () => {
    // Class-level @Secured('ADMIN') + method-level @Anonymous → anonymous wins
    const ctx = makeCtx({ roles: 'ADMIN', anonymous: true });
    const result = interceptor.intercept(ctx);
    expect(result).toBe('ok');
  });

  it('calls proceed() when authorized', async () => {
    const principal: Principal = {
      name: 'admin',
      roles: ['ADMIN'],
      attributes: {},
    };
    let called = false;
    const ctx: InvocationContext = {
      className: 'Svc',
      methodName: 'op',
      args: [],
      target: {},
      proceed: () => {
        called = true;
        return 42;
      },
      metadata: { roles: 'ADMIN' },
    };

    const result = await SecurityContext.run(principal, () =>
      interceptor.intercept(ctx),
    );
    expect(called).toBe(true);
    expect(result).toBe(42);
  });
});
