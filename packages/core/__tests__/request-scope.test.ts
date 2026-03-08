import { describe, expect, it } from 'vitest';
import { ApplicationContext } from '../src/application-context.js';
import type { BeanDefinition, Dependency } from '../src/bean-definition.js';
import { RequestScopeManager } from '../src/request-scope.js';
import type { Scope } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

class RequestService {
  value = 'default';
}

class SingletonService {
  constructor(public requestService: RequestService) {}
  getValue() {
    return this.requestService.value;
  }
}

function dep(token: Dependency['token'], optional = false): Dependency {
  return { token, optional, collection: false };
}

function makeDef<T>(
  token: BeanDefinition<T>['token'],
  opts: {
    deps?: Dependency[];
    factory?: (...args: unknown[]) => T;
    scope?: Scope;
  } = {},
): BeanDefinition<T> {
  return {
    token,
    scope: opts.scope ?? 'singleton',
    dependencies: opts.deps ?? [],
    factory: opts.factory ?? ((() => ({})) as () => T),
    eager: false,
    metadata: {},
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Request-scoped beans', () => {
  it('should create a new instance per request scope', async () => {
    const ctx = await ApplicationContext.create([
      makeDef(RequestService, {
        scope: 'request',
        factory: () => new RequestService(),
      }),
    ]);

    let instance1: RequestService | undefined;
    let instance2: RequestService | undefined;

    RequestScopeManager.run(() => {
      instance1 = ctx.get(RequestService);
      const same = ctx.get(RequestService);
      expect(instance1).toBe(same); // same within one scope
    });

    RequestScopeManager.run(() => {
      instance2 = ctx.get(RequestService);
    });

    expect(instance1).toBeDefined();
    expect(instance2).toBeDefined();
    expect(instance1).not.toBe(instance2); // different across scopes
  });

  it('should throw when accessed outside a request scope', async () => {
    const ctx = await ApplicationContext.create([
      makeDef(RequestService, {
        scope: 'request',
        factory: () => new RequestService(),
      }),
    ]);

    expect(() => ctx.get(RequestService)).toThrow('No active request scope');
  });

  it('should inject a proxy when a singleton depends on request-scoped bean', async () => {
    const ctx = await ApplicationContext.create([
      makeDef(RequestService, {
        scope: 'request',
        factory: () => new RequestService(),
      }),
      makeDef(SingletonService, {
        scope: 'singleton',
        deps: [dep(RequestService)],
        factory: (rs: unknown) => new SingletonService(rs as RequestService),
      }),
    ]);

    // Singleton can be created outside request scope (proxy is lazy)
    const singleton = ctx.get(SingletonService);
    expect(singleton).toBeDefined();

    // But accessing the proxy's properties requires an active scope
    expect(() => singleton.getValue()).toThrow('No active request scope');

    // Within a request scope, the proxy delegates correctly
    RequestScopeManager.run(() => {
      const rs = ctx.get(RequestService);
      rs.value = 'from-request-1';
      expect(singleton.getValue()).toBe('from-request-1');
    });

    // Different request scope → different instance
    RequestScopeManager.run(() => {
      expect(singleton.getValue()).toBe('default');
    });
  });

  it('should support instanceof and prototype checks on proxy', async () => {
    const ctx = await ApplicationContext.create([
      makeDef(RequestService, {
        scope: 'request',
        factory: () => new RequestService(),
      }),
      makeDef(SingletonService, {
        scope: 'singleton',
        deps: [dep(RequestService)],
        factory: (rs: unknown) => new SingletonService(rs as RequestService),
      }),
    ]);

    const singleton = ctx.get(SingletonService);

    RequestScopeManager.run(() => {
      // The proxy's prototype matches the real instance
      expect(singleton.requestService instanceof RequestService).toBe(true);
      // `in` operator works
      expect('value' in singleton.requestService).toBe(true);
    });
  });

  it('should pass env bindings through RequestScopeManager', () => {
    const env = { DB: 'my-d1-binding', SECRET: 'abc' };

    RequestScopeManager.run(() => {
      expect(RequestScopeManager.getEnv()).toEqual(env);
      expect(RequestScopeManager.getBinding('DB')).toBe('my-d1-binding');
      expect(() => RequestScopeManager.getBinding('MISSING')).toThrow(
        "binding 'MISSING' not found",
      );
    }, env);
  });

  it('should support getAsync for request-scoped beans', async () => {
    const ctx = await ApplicationContext.create([
      makeDef(RequestService, {
        scope: 'request',
        factory: () => new RequestService(),
      }),
    ]);

    await RequestScopeManager.run(async () => {
      const instance = await ctx.getAsync(RequestService);
      expect(instance).toBeInstanceOf(RequestService);
    });
  });
});
