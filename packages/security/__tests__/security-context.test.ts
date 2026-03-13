import { describe, expect, it } from 'vitest';
import type { Principal } from '../src/principal.js';
import { SecurityContext } from '../src/security-context.js';

describe('SecurityContext', () => {
  it('returns undefined when no context is set', () => {
    expect(SecurityContext.current()).toBeUndefined();
  });

  it('stores and retrieves principal within run()', async () => {
    const principal: Principal = {
      name: 'alice',
      roles: ['USER'],
      attributes: { email: 'alice@example.com' },
    };

    await SecurityContext.run(principal, () => {
      const current = SecurityContext.current();
      expect(current).toBe(principal);
      expect(current!.name).toBe('alice');
      expect(current!.roles).toEqual(['USER']);
    });
  });

  it('restores undefined after run() completes', async () => {
    const principal: Principal = {
      name: 'bob',
      roles: [],
      attributes: {},
    };

    await SecurityContext.run(principal, () => {
      expect(SecurityContext.current()).toBe(principal);
    });

    expect(SecurityContext.current()).toBeUndefined();
  });

  it('supports nested contexts', async () => {
    const outer: Principal = {
      name: 'outer',
      roles: [],
      attributes: {},
    };
    const inner: Principal = {
      name: 'inner',
      roles: [],
      attributes: {},
    };

    await SecurityContext.run(outer, async () => {
      expect(SecurityContext.current()!.name).toBe('outer');

      await SecurityContext.run(inner, () => {
        expect(SecurityContext.current()!.name).toBe('inner');
      });

      expect(SecurityContext.current()!.name).toBe('outer');
    });
  });

  it('supports unauthenticated run (undefined principal)', async () => {
    await SecurityContext.run(undefined, () => {
      expect(SecurityContext.current()).toBeUndefined();
    });
  });

  it('isActive() returns true inside security context even when unauthenticated', async () => {
    await SecurityContext.run(undefined, () => {
      expect(SecurityContext.isActive()).toBe(true);
      expect(SecurityContext.current()).toBeUndefined();
    });
  });

  it('isActive() returns true when authenticated', async () => {
    const principal: Principal = {
      name: 'alice',
      roles: [],
      attributes: {},
    };
    await SecurityContext.run(principal, () => {
      expect(SecurityContext.isActive()).toBe(true);
    });
  });
});
