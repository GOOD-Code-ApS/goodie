import { describe, expect, it } from 'vitest';
import { Anonymous } from '../src/anonymous.js';
import { UnauthorizedError } from '../src/errors.js';
import { getPrincipal } from '../src/get-principal.js';
import { Secured } from '../src/secured.js';
import { SecurityContext } from '../src/security-context.js';

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

describe('getPrincipal', () => {
  it('returns principal when set', () => {
    const ctx = new SecurityContext();
    const principal = { name: 'alice', attributes: {} };

    const result = ctx.run(principal, () => getPrincipal(ctx));
    expect(result).toEqual(principal);
  });

  it('throws when no principal is set', () => {
    const ctx = new SecurityContext();
    expect(() => getPrincipal(ctx)).toThrow('No principal in security context');
  });
});

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
