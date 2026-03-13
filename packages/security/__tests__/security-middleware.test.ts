import { HttpContext } from '@goodie-ts/http';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../src/principal.js';
import { SecurityContext } from '../src/security-context.js';
import { createSecurityMiddleware } from '../src/security-middleware.js';
import type { SecurityProvider } from '../src/security-provider.js';

function makeRequest(headers: Record<string, string> = {}): HttpContext {
  return new HttpContext({
    headers: new Headers(headers),
  });
}

describe('createSecurityMiddleware', () => {
  it('sets principal when provider authenticates', async () => {
    const principal: Principal = {
      name: 'alice',
      roles: ['USER'],
      attributes: {},
    };

    const provider: SecurityProvider = {
      authenticate: () => principal,
    };

    const middleware = createSecurityMiddleware([provider]);
    let captured: Principal | undefined;

    await middleware(makeRequest(), async () => {
      captured = SecurityContext.current();
    });

    expect(captured).toBe(principal);
  });

  it('sets undefined when no provider authenticates', async () => {
    const provider: SecurityProvider = {
      authenticate: () => undefined,
    };

    const middleware = createSecurityMiddleware([provider]);
    let captured: Principal | undefined = {
      name: 'should-be-replaced',
      roles: [],
      attributes: {},
    };

    await middleware(makeRequest(), async () => {
      captured = SecurityContext.current();
    });

    expect(captured).toBeUndefined();
  });

  it('stops at first successful provider', async () => {
    const principal1: Principal = {
      name: 'from-provider-1',
      roles: [],
      attributes: {},
    };

    let provider2Called = false;
    const providers: SecurityProvider[] = [
      { authenticate: () => principal1 },
      {
        authenticate: () => {
          provider2Called = true;
          return { name: 'from-provider-2', roles: [], attributes: {} };
        },
      },
    ];

    const middleware = createSecurityMiddleware(providers);
    let captured: Principal | undefined;

    await middleware(makeRequest(), async () => {
      captured = SecurityContext.current();
    });

    expect(captured!.name).toBe('from-provider-1');
    expect(provider2Called).toBe(false);
  });

  it('passes HttpContext to providers', async () => {
    let receivedHeaders: Headers | undefined;

    const provider: SecurityProvider = {
      authenticate: (request) => {
        receivedHeaders = request.headers;
        return undefined;
      },
    };

    const middleware = createSecurityMiddleware([provider]);
    await middleware(
      makeRequest({ Authorization: 'Bearer token123' }),
      async () => {},
    );

    expect(receivedHeaders!.get('Authorization')).toBe('Bearer token123');
  });

  it('supports async providers', async () => {
    const principal: Principal = {
      name: 'async-user',
      roles: [],
      attributes: {},
    };

    const provider: SecurityProvider = {
      authenticate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return principal;
      },
    };

    const middleware = createSecurityMiddleware([provider]);
    let captured: Principal | undefined;

    await middleware(makeRequest(), async () => {
      captured = SecurityContext.current();
    });

    expect(captured!.name).toBe('async-user');
  });
});
