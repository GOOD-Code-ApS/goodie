import type { InvocationContext } from '@goodie-ts/core';
import { describe, expect, it } from 'vitest';
import { Anonymous } from '../src/anonymous.js';
import { UnauthorizedError } from '../src/errors.js';
import { Secured } from '../src/secured.js';
import { SecurityContext } from '../src/security-context.js';
import { SecurityInterceptor } from '../src/security-interceptor.js';

describe('SecurityContext', () => {
  it('returns null when no principal is set', () => {
    const ctx = new SecurityContext();
    expect(ctx.getPrincipal()).toBeNull();
  });

  it('stores and retrieves principal within async context', async () => {
    const ctx = new SecurityContext();
    const principal = { name: 'alice', attributes: { role: 'admin' } };

    await ctx.run(principal, async () => {
      expect(ctx.getPrincipal()).toEqual(principal);
    });

    // Outside the run, principal is null again
    expect(ctx.getPrincipal()).toBeNull();
  });

  it('supports nested contexts', async () => {
    const ctx = new SecurityContext();
    const alice = { name: 'alice', attributes: {} };
    const bob = { name: 'bob', attributes: {} };

    await ctx.run(alice, async () => {
      expect(ctx.getPrincipal()!.name).toBe('alice');

      await ctx.run(bob, async () => {
        expect(ctx.getPrincipal()!.name).toBe('bob');
      });

      expect(ctx.getPrincipal()!.name).toBe('alice');
    });
  });
});

describe('SecurityInterceptor', () => {
  it('proceeds when principal is present', () => {
    const securityContext = new SecurityContext();
    const interceptor = new SecurityInterceptor(securityContext);
    const principal = { name: 'alice', attributes: {} };

    const result = securityContext.run(principal, () => {
      return interceptor.intercept({
        className: 'TestService',
        methodName: 'doSomething',
        args: [],
        target: {},
        proceed: () => 'success',
      } as InvocationContext);
    });

    expect(result).toBe('success');
  });

  it('throws UnauthorizedError when no principal', () => {
    const securityContext = new SecurityContext();
    const interceptor = new SecurityInterceptor(securityContext);

    expect(() =>
      interceptor.intercept({
        className: 'TestService',
        methodName: 'doSomething',
        args: [],
        target: {},
        proceed: () => 'success',
      } as InvocationContext),
    ).toThrow(UnauthorizedError);
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
