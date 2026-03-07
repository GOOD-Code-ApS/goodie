import type { HttpFilterContext } from '@goodie-ts/http';
import { describe, expect, it, vi } from 'vitest';
import { SECURITY_META } from '../src/metadata.js';
import type { Principal } from '../src/principal.js';
import { SecurityContext } from '../src/security-context.js';
import { SecurityHttpFilter } from '../src/security-http-filter.js';
import type { SecurityProvider } from '../src/security-provider.js';

function createMockHonoContext(headers: Record<string, string> = {}) {
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
      url: 'http://localhost/test',
      method: 'GET',
    },
  };
}

function createFilterContext(
  honoCtx: unknown,
  routeMetadata: Record<symbol, unknown>,
  methodName: string,
): HttpFilterContext {
  return { request: honoCtx, routeMetadata, methodName };
}

function createFilter(provider: SecurityProvider): SecurityHttpFilter {
  const securityContext = new SecurityContext();
  const filter = new SecurityHttpFilter(securityContext);
  // Simulate field injection
  (filter as any).securityProvider = provider;
  return filter;
}

describe('SecurityHttpFilter', () => {
  it('allows unauthenticated access to non-secured routes', async () => {
    const provider: SecurityProvider = {
      authenticate: vi.fn().mockResolvedValue(null),
    };
    const filter = createFilter(provider);
    const mw = filter.middleware();

    const next = vi.fn().mockResolvedValue(undefined);
    const ctx = createFilterContext(
      createMockHonoContext(),
      {}, // no @Secured metadata
      'publicEndpoint',
    );

    const result = await mw(ctx, next);

    expect(result).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 for secured route without credentials', async () => {
    const provider: SecurityProvider = {
      authenticate: vi.fn().mockResolvedValue(null),
    };
    const filter = createFilter(provider);
    const mw = filter.middleware();

    const next = vi.fn();
    const ctx = createFilterContext(
      createMockHonoContext(),
      { [SECURITY_META.SECURED]: true },
      'listUsers',
    );

    const result = await mw(ctx, next);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    expect(next).not.toHaveBeenCalled();

    const body = await result!.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('allows authenticated access to secured route', async () => {
    const principal: Principal = { name: 'alice', attributes: {} };
    const provider: SecurityProvider = {
      authenticate: vi.fn().mockResolvedValue(principal),
    };
    const filter = createFilter(provider);
    const mw = filter.middleware();

    const next = vi.fn().mockResolvedValue(undefined);
    const ctx = createFilterContext(
      createMockHonoContext({ authorization: 'Bearer token123' }),
      { [SECURITY_META.SECURED]: true },
      'listUsers',
    );

    const result = await mw(ctx, next);

    expect(result).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('respects @Anonymous on a method in a @Secured class', async () => {
    const provider: SecurityProvider = {
      authenticate: vi.fn().mockResolvedValue(null),
    };
    const filter = createFilter(provider);
    const mw = filter.middleware();

    const next = vi.fn().mockResolvedValue(undefined);
    const ctx = createFilterContext(
      createMockHonoContext(),
      {
        [SECURITY_META.SECURED]: true,
        [SECURITY_META.ANONYMOUS_METHODS]: new Set(['health']),
      },
      'health',
    );

    const result = await mw(ctx, next);

    expect(result).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('enforces method-level @Secured without class-level', async () => {
    const provider: SecurityProvider = {
      authenticate: vi.fn().mockResolvedValue(null),
    };
    const filter = createFilter(provider);
    const mw = filter.middleware();

    const next = vi.fn();
    const ctx = createFilterContext(
      createMockHonoContext(),
      {
        [SECURITY_META.SECURED_METHODS]: new Set(['getProfile']),
      },
      'getProfile',
    );

    const result = await mw(ctx, next);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not enforce on non-secured method in partially secured controller', async () => {
    const provider: SecurityProvider = {
      authenticate: vi.fn().mockResolvedValue(null),
    };
    const filter = createFilter(provider);
    const mw = filter.middleware();

    const next = vi.fn().mockResolvedValue(undefined);
    const ctx = createFilterContext(
      createMockHonoContext(),
      {
        [SECURITY_META.SECURED_METHODS]: new Set(['getProfile']),
      },
      'publicEndpoint',
    );

    const result = await mw(ctx, next);

    expect(result).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('sets principal in SecurityContext for downstream use', async () => {
    const principal: Principal = {
      name: 'alice',
      attributes: { role: 'admin' },
    };
    const provider: SecurityProvider = {
      authenticate: vi.fn().mockResolvedValue(principal),
    };
    const securityContext = new SecurityContext();
    const filter = new SecurityHttpFilter(securityContext);
    (filter as any).securityProvider = provider;
    const mw = filter.middleware();

    let capturedPrincipal: Principal | null = null;
    const next = vi.fn().mockImplementation(async () => {
      capturedPrincipal = securityContext.getPrincipal();
    });

    const ctx = createFilterContext(
      createMockHonoContext({ authorization: 'Bearer token' }),
      {},
      'anyMethod',
    );

    await mw(ctx, next);

    expect(capturedPrincipal).toEqual(principal);
    // Outside the filter, context is cleared
    expect(securityContext.getPrincipal()).toBeNull();
  });
});
