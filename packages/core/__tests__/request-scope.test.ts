import { describe, expect, it } from 'vitest';
import { ApplicationContext } from '../src/application-context.js';
import type {
  ComponentDefinition,
  Dependency,
} from '../src/component-definition.js';
import { RequestScopeManager } from '../src/request-scope.js';
import type { Scope } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

class RequestService {
  value = 'default';
  getValue() {
    return this.value;
  }
}

class AsyncRequestService {
  initialized = false;
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

/**
 * Build a compile-time scoped proxy factory (mimics what the transformer generates).
 * Uses Object.create with property descriptors — no runtime Proxy.
 */
function buildScopedProxyFactory(
  proto: object,
  members: Array<{ name: string; kind: 'getter' | 'method' | 'property' }>,
): (resolve: () => any) => any {
  return (resolve: () => any) => {
    const descriptors: PropertyDescriptorMap = {};
    for (const member of members) {
      if (member.kind === 'method') {
        descriptors[member.name] = {
          get() {
            const t = resolve();
            return t[member.name].bind(t);
          },
          configurable: true,
        };
      } else {
        descriptors[member.name] = {
          get() {
            return resolve()[member.name];
          },
          configurable: true,
        };
      }
    }
    return Object.create(proto, descriptors);
  };
}

function makeDef<T>(
  token: ComponentDefinition<T>['token'],
  opts: {
    deps?: Dependency[];
    factory?: (...args: unknown[]) => T;
    scope?: Scope;
    metadata?: Record<string, unknown>;
  } = {},
): ComponentDefinition<T> {
  return {
    token,
    scope: opts.scope ?? 'singleton',
    dependencies: opts.deps ?? [],
    factory: opts.factory ?? ((() => ({})) as () => T),
    eager: false,
    metadata: opts.metadata ?? {},
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

    await RequestScopeManager.run(() => {
      instance1 = ctx.get(RequestService);
      const same = ctx.get(RequestService);
      expect(instance1).toBe(same); // same within one scope
    });

    await RequestScopeManager.run(() => {
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

  it('should inject a compile-time scoped proxy when a singleton depends on request-scoped bean', async () => {
    const proxyFactory = buildScopedProxyFactory(RequestService.prototype, [
      { name: 'value', kind: 'property' },
      { name: 'getValue', kind: 'method' },
    ]);

    const ctx = await ApplicationContext.create([
      makeDef(RequestService, {
        scope: 'request',
        factory: () => new RequestService(),
        metadata: { scopedProxyFactory: proxyFactory },
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
    await RequestScopeManager.run(() => {
      const rs = ctx.get(RequestService);
      rs.value = 'from-request-1';
      expect(singleton.getValue()).toBe('from-request-1');
    });

    // Different request scope → different instance
    await RequestScopeManager.run(() => {
      expect(singleton.getValue()).toBe('default');
    });
  });

  it('should support instanceof on compile-time scoped proxy', async () => {
    const proxyFactory = buildScopedProxyFactory(RequestService.prototype, [
      { name: 'value', kind: 'property' },
      { name: 'getValue', kind: 'method' },
    ]);

    const ctx = await ApplicationContext.create([
      makeDef(RequestService, {
        scope: 'request',
        factory: () => new RequestService(),
        metadata: { scopedProxyFactory: proxyFactory },
      }),
      makeDef(SingletonService, {
        scope: 'singleton',
        deps: [dep(RequestService)],
        factory: (rs: unknown) => new SingletonService(rs as RequestService),
      }),
    ]);

    const singleton = ctx.get(SingletonService);

    // instanceof works because Object.create uses the real prototype
    expect(singleton.requestService instanceof RequestService).toBe(true);

    await RequestScopeManager.run(() => {
      expect(singleton.requestService instanceof RequestService).toBe(true);
      expect(singleton.requestService.value).toBe('default');
    });
  });

  it('should throw when no scopedProxyFactory is provided', async () => {
    const ctx = await ApplicationContext.create([
      makeDef(RequestService, {
        scope: 'request',
        factory: () => new RequestService(),
        // No scopedProxyFactory in metadata
      }),
      makeDef(SingletonService, {
        scope: 'singleton',
        deps: [dep(RequestService)],
        factory: (rs: unknown) => new SingletonService(rs as RequestService),
      }),
    ]);

    expect(() => ctx.get(SingletonService)).toThrow('No scoped proxy factory');
  });

  it('should pass env bindings through RequestScopeManager', async () => {
    const env = { DB: 'my-d1-binding', SECRET: 'abc' };

    await RequestScopeManager.run(() => {
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

  it('should support async @OnInit on request-scoped beans via getAsync', async () => {
    const ctx = await ApplicationContext.create([
      makeDef(AsyncRequestService, {
        scope: 'request',
        factory: () => new AsyncRequestService(),
        metadata: {
          onInitMethods: ['init'],
        },
      }),
    ]);

    // Patch the prototype with an async init
    AsyncRequestService.prototype.init = async function (
      this: AsyncRequestService,
    ) {
      await new Promise((r) => setTimeout(r, 1));
      this.initialized = true;
    };

    await RequestScopeManager.run(async () => {
      const instance = await ctx.getAsync(AsyncRequestService);
      expect(instance).toBeInstanceOf(AsyncRequestService);
      expect(instance.initialized).toBe(true);
    });
  });

  it('should throw AsyncComponentNotReadyError for sync get() on async request-scoped bean', async () => {
    const ctx = await ApplicationContext.create([
      makeDef(AsyncRequestService, {
        scope: 'request',
        factory: () => new AsyncRequestService(),
        metadata: {
          onInitMethods: ['init'],
        },
      }),
    ]);

    AsyncRequestService.prototype.init = async () => {
      await new Promise((r) => setTimeout(r, 1));
    };

    await RequestScopeManager.run(() => {
      expect(() => ctx.get(AsyncRequestService)).toThrow('async');
    });
  });
});
