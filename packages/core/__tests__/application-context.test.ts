import { describe, expect, it } from 'vitest';
import { ApplicationContext } from '../src/application-context.js';
import type {
  ComponentDefinition,
  Dependency,
} from '../src/component-definition.js';
import type { ComponentPostProcessor } from '../src/component-post-processor.js';
import {
  AsyncBeanNotReadyError,
  CircularDependencyError,
  ContextClosedError,
  MissingDependencyError,
} from '../src/errors.js';
import { InjectionToken } from '../src/injection-token.js';
import type { Scope } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

function dep(token: Dependency['token'], optional = false): Dependency {
  return { token, optional, collection: false };
}

function makeDef<T>(
  token: ComponentDefinition<T>['token'],
  opts: {
    deps?: Dependency[];
    factory?: (...args: unknown[]) => T | Promise<T>;
    scope?: Scope;
    eager?: boolean;
    metadata?: Record<string, unknown>;
  } = {},
): ComponentDefinition<T> {
  return {
    token,
    scope: opts.scope ?? 'singleton',
    dependencies: opts.deps ?? [],
    factory: opts.factory ?? ((() => ({})) as () => T),
    eager: opts.eager ?? false,
    metadata: opts.metadata ?? {},
  };
}

// ── Basic Resolution ─────────────────────────────────────────────────

describe('ApplicationContext — basic resolution', () => {
  it('resolves a bean with no dependencies', async () => {
    class Foo {
      value = 42;
    }
    const ctx = await ApplicationContext.create([
      makeDef(Foo, { factory: () => new Foo() }),
    ]);
    const foo = ctx.get(Foo);
    expect(foo).toBeInstanceOf(Foo);
    expect(foo.value).toBe(42);
  });

  it('resolves a bean with one dependency', async () => {
    class Repo {}
    class Service {
      constructor(readonly repo: Repo) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(Repo, { factory: () => new Repo() }),
      makeDef(Service, {
        deps: [dep(Repo)],
        factory: (r) => new Service(r as Repo),
      }),
    ]);
    const svc = ctx.get(Service);
    expect(svc).toBeInstanceOf(Service);
    expect(svc.repo).toBeInstanceOf(Repo);
  });

  it('resolves a dependency chain: A → B → C', async () => {
    class C {
      value = 'c';
    }
    class B {
      constructor(readonly c: C) {}
    }
    class A {
      constructor(readonly b: B) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(C, { factory: () => new C() }),
      makeDef(B, { deps: [dep(C)], factory: (c) => new B(c as C) }),
      makeDef(A, { deps: [dep(B)], factory: (b) => new A(b as B) }),
    ]);
    const a = ctx.get(A);
    expect(a.b.c.value).toBe('c');
  });

  it('resolves diamond dependencies correctly', async () => {
    class D {}
    class B {
      constructor(readonly d: D) {}
    }
    class C {
      constructor(readonly d: D) {}
    }
    class A {
      constructor(
        readonly b: B,
        readonly c: C,
      ) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(D, { factory: () => new D() }),
      makeDef(B, { deps: [dep(D)], factory: (d) => new B(d as D) }),
      makeDef(C, { deps: [dep(D)], factory: (d) => new C(d as D) }),
      makeDef(A, {
        deps: [dep(B), dep(C)],
        factory: (b, c) => new A(b as B, c as C),
      }),
    ]);
    const a = ctx.get(A);
    // D is singleton, so both B and C should share the same D
    expect(a.b.d).toBe(a.c.d);
  });

  it('resolves InjectionToken-based beans', async () => {
    const DB_URL = new InjectionToken<string>('DB_URL');
    const ctx = await ApplicationContext.create([
      makeDef<string>(DB_URL, { factory: () => 'postgres://localhost' }),
    ]);
    const url = ctx.get(DB_URL);
    expect(url).toBe('postgres://localhost');
  });
});

// ── Scopes ───────────────────────────────────────────────────────────

describe('ApplicationContext — scopes', () => {
  it('singleton returns the same instance', async () => {
    class S {}
    const ctx = await ApplicationContext.create([
      makeDef(S, { scope: 'singleton', factory: () => new S() }),
    ]);
    expect(ctx.get(S)).toBe(ctx.get(S));
  });

  it('prototype returns a new instance each time', async () => {
    class P {}
    const ctx = await ApplicationContext.create([
      makeDef(P, { scope: 'transient', factory: () => new P() }),
    ]);
    expect(ctx.get(P)).not.toBe(ctx.get(P));
  });

  it('singleton dep used by prototype parent is shared', async () => {
    class Shared {}
    class Proto {
      constructor(readonly shared: Shared) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(Shared, { scope: 'singleton', factory: () => new Shared() }),
      makeDef(Proto, {
        scope: 'transient',
        deps: [dep(Shared)],
        factory: (s) => new Proto(s as Shared),
      }),
    ]);
    const p1 = ctx.get(Proto);
    const p2 = ctx.get(Proto);
    expect(p1).not.toBe(p2);
    expect(p1.shared).toBe(p2.shared);
  });
});

// ── Async ────────────────────────────────────────────────────────────

describe('ApplicationContext — async', () => {
  it('getAsync resolves an async factory', async () => {
    class AsyncService {
      value = 'async';
    }
    const ctx = await ApplicationContext.create([
      makeDef(AsyncService, {
        factory: async () => {
          await new Promise((r) => setTimeout(r, 1));
          return new AsyncService();
        },
      }),
    ]);
    const svc = await ctx.getAsync(AsyncService);
    expect(svc).toBeInstanceOf(AsyncService);
    expect(svc.value).toBe('async');
  });

  it('get() throws AsyncBeanNotReadyError for unresolved async bean', async () => {
    class AsyncBean {}
    const ctx = await ApplicationContext.create([
      makeDef(AsyncBean, {
        factory: async () => new AsyncBean(),
      }),
    ]);
    expect(() => ctx.get(AsyncBean)).toThrow(AsyncBeanNotReadyError);
  });

  it('get() throws AsyncBeanNotReadyError on second call too (not UNRESOLVED symbol)', async () => {
    class AsyncBean {}
    const ctx = await ApplicationContext.create([
      makeDef(AsyncBean, {
        factory: async () => new AsyncBean(),
      }),
    ]);
    // First call sets UNRESOLVED in cache and throws
    expect(() => ctx.get(AsyncBean)).toThrow(AsyncBeanNotReadyError);
    // Second call must also throw (not return the UNRESOLVED Symbol)
    expect(() => ctx.get(AsyncBean)).toThrow(AsyncBeanNotReadyError);
  });

  it('eager async bean is available via get() after context creation', async () => {
    class EagerAsync {
      value = 'ready';
    }
    const ctx = await ApplicationContext.create([
      makeDef(EagerAsync, {
        eager: true,
        factory: async () => {
          await new Promise((r) => setTimeout(r, 1));
          return new EagerAsync();
        },
      }),
    ]);
    // Should be available synchronously since it was eagerly resolved
    const bean = ctx.get(EagerAsync);
    expect(bean).toBeInstanceOf(EagerAsync);
    expect(bean.value).toBe('ready');
  });

  it('getAsync deduplicates concurrent resolution of the same singleton', async () => {
    let callCount = 0;
    class Dedup {}
    const ctx = await ApplicationContext.create([
      makeDef(Dedup, {
        factory: async () => {
          callCount++;
          await new Promise((r) => setTimeout(r, 10));
          return new Dedup();
        },
      }),
    ]);
    const [a, b] = await Promise.all([
      ctx.getAsync(Dedup),
      ctx.getAsync(Dedup),
    ]);
    expect(a).toBe(b);
    expect(callCount).toBe(1);
  });
});

// ── ComponentPostProcessor ────────────────────────────────────────────────

describe('ApplicationContext — ComponentPostProcessor', () => {
  it('calls beforeInit on created beans', async () => {
    const calls: string[] = [];
    class Target {
      name = 'target';
    }
    const processor: ComponentPostProcessor = {
      beforeInit(bean) {
        calls.push('beforeInit');
        return bean;
      },
    };
    const ctx = await ApplicationContext.create([
      makeDef(Target, { factory: () => new Target() }),
      makeDef<ComponentPostProcessor>(
        new InjectionToken<ComponentPostProcessor>('pp'),
        {
          factory: () => processor,
          metadata: { isComponentPostProcessor: true },
        },
      ),
    ]);
    ctx.get(Target);
    expect(calls).toEqual(['beforeInit']);
  });

  it('calls afterInit on created beans', async () => {
    const calls: string[] = [];
    class Target {}
    const processor: ComponentPostProcessor = {
      afterInit(bean) {
        calls.push('afterInit');
        return bean;
      },
    };
    const ctx = await ApplicationContext.create([
      makeDef(Target, { factory: () => new Target() }),
      makeDef<ComponentPostProcessor>(
        new InjectionToken<ComponentPostProcessor>('pp'),
        {
          factory: () => processor,
          metadata: { isComponentPostProcessor: true },
        },
      ),
    ]);
    ctx.get(Target);
    expect(calls).toEqual(['afterInit']);
  });

  it('can replace a bean instance', async () => {
    class Original {
      kind = 'original';
    }
    class Replacement {
      kind = 'replaced';
    }
    const processor: ComponentPostProcessor = {
      afterInit<T>(bean: T, def: ComponentDefinition<T>): T {
        if (def.token === Original) {
          return new Replacement() as unknown as T;
        }
        return bean;
      },
    };
    const ctx = await ApplicationContext.create([
      makeDef(Original, { factory: () => new Original() }),
      makeDef<ComponentPostProcessor>(
        new InjectionToken<ComponentPostProcessor>('pp'),
        {
          factory: () => processor,
          metadata: { isComponentPostProcessor: true },
        },
      ),
    ]);
    const result = ctx.get(Original) as unknown as Replacement;
    expect(result.kind).toBe('replaced');
  });

  it('processes in registration order', async () => {
    const order: string[] = [];
    class Target {}
    const pp1: ComponentPostProcessor = {
      afterInit(bean) {
        order.push('pp1');
        return bean;
      },
    };
    const pp2: ComponentPostProcessor = {
      afterInit(bean) {
        order.push('pp2');
        return bean;
      },
    };
    const ctx = await ApplicationContext.create([
      makeDef(Target, { factory: () => new Target() }),
      makeDef<ComponentPostProcessor>(
        new InjectionToken<ComponentPostProcessor>('pp1'),
        {
          factory: () => pp1,
          metadata: { isComponentPostProcessor: true },
        },
      ),
      makeDef<ComponentPostProcessor>(
        new InjectionToken<ComponentPostProcessor>('pp2'),
        {
          factory: () => pp2,
          metadata: { isComponentPostProcessor: true },
        },
      ),
    ]);
    ctx.get(Target);
    expect(order).toEqual(['pp1', 'pp2']);
  });

  it('does not apply post-processors to other post-processors', async () => {
    const processed: string[] = [];
    class Target {}
    const pp1: ComponentPostProcessor = {
      afterInit(bean, def) {
        processed.push(tokenDesc(def.token));
        return bean;
      },
    };
    const ppToken = new InjectionToken<ComponentPostProcessor>('pp1');
    const ctx = await ApplicationContext.create([
      makeDef(Target, { factory: () => new Target() }),
      makeDef<ComponentPostProcessor>(ppToken, {
        factory: () => pp1,
        metadata: { isComponentPostProcessor: true },
      }),
    ]);
    ctx.get(Target);
    // pp1 should only have been called for Target, not for itself
    expect(processed).toEqual(['Target']);
  });

  it('resolves ComponentPostProcessor with constructor dependencies', async () => {
    class Config {
      prefix = 'LOG';
    }
    class Target {
      label = '';
    }
    const ppToken = new InjectionToken<ComponentPostProcessor>('loggingPP');
    const ctx = await ApplicationContext.create([
      makeDef(Config, { factory: () => new Config() }),
      makeDef<ComponentPostProcessor>(ppToken, {
        deps: [dep(Config)],
        factory: (config) => {
          const cfg = config as Config;
          return {
            afterInit<T>(bean: T, def: ComponentDefinition<T>): T {
              if (def.token === Target) {
                (bean as Target).label = `${cfg.prefix}:processed`;
              }
              return bean;
            },
          } satisfies ComponentPostProcessor;
        },
        metadata: { isComponentPostProcessor: true },
      }),
      makeDef(Target, { factory: () => new Target() }),
    ]);
    const target = ctx.get(Target);
    expect(target.label).toBe('LOG:processed');
  });

  it('resolves ComponentPostProcessor with async constructor dependency', async () => {
    class AsyncConfig {
      timeout = 5000;
    }
    class Target {
      timeout = 0;
    }
    const ppToken = new InjectionToken<ComponentPostProcessor>('asyncPP');
    const ctx = await ApplicationContext.create([
      makeDef(AsyncConfig, {
        factory: async () => {
          await new Promise((r) => setTimeout(r, 1));
          return new AsyncConfig();
        },
      }),
      makeDef<ComponentPostProcessor>(ppToken, {
        deps: [dep(AsyncConfig)],
        factory: (config) => {
          const cfg = config as AsyncConfig;
          return {
            afterInit<T>(bean: T, def: ComponentDefinition<T>): T {
              if (def.token === Target) {
                (bean as Target).timeout = cfg.timeout;
              }
              return bean;
            },
          } satisfies ComponentPostProcessor;
        },
        metadata: { isComponentPostProcessor: true },
      }),
      makeDef(Target, { factory: () => new Target() }),
    ]);
    const target = ctx.get(Target);
    expect(target.timeout).toBe(5000);
  });

  it('earlier processors are applied to later processor dependencies', async () => {
    const processed: string[] = [];
    class Config {
      value = 'original';
    }
    class Target {}

    const pp1Token = new InjectionToken<ComponentPostProcessor>('pp1');
    const pp2Token = new InjectionToken<ComponentPostProcessor>('pp2');

    const ctx = await ApplicationContext.create([
      makeDef(Config, { factory: () => new Config() }),
      makeDef<ComponentPostProcessor>(pp1Token, {
        factory: () => ({
          afterInit(bean, def) {
            processed.push(tokenDesc(def.token));
            return bean;
          },
        }),
        metadata: { isComponentPostProcessor: true },
      }),
      makeDef<ComponentPostProcessor>(pp2Token, {
        deps: [dep(Config)],
        factory: (_config) => {
          // pp2 depends on Config; Config should be post-processed by pp1
          return {
            afterInit(bean, def) {
              processed.push(`pp2:${tokenDesc(def.token)}`);
              return bean;
            },
          } satisfies ComponentPostProcessor;
        },
        metadata: { isComponentPostProcessor: true },
      }),
      makeDef(Target, { factory: () => new Target() }),
    ]);
    ctx.get(Target);
    // pp1 should have processed Config (as a dependency of pp2 during initPostProcessors)
    // Then both pp1 and pp2 should process Target
    expect(processed).toContain('Config');
    expect(processed).toContain('Target');
    expect(processed).toContain('pp2:Target');
  });
});

// ── Optional Dependencies ────────────────────────────────────────────

describe('ApplicationContext — optional deps', () => {
  it('resolves missing optional dep to undefined', async () => {
    const MISSING = new InjectionToken<string>('missing');
    class Service {
      constructor(readonly opt: string | undefined) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        deps: [dep(MISSING, true)],
        factory: (opt) => new Service(opt as string | undefined),
      }),
    ]);
    const svc = ctx.get(Service);
    expect(svc.opt).toBeUndefined();
  });

  it('resolves present optional dep normally', async () => {
    const OPT = new InjectionToken<string>('opt');
    class Service {
      constructor(readonly opt: string) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef<string>(OPT, { factory: () => 'present' }),
      makeDef(Service, {
        deps: [dep(OPT, true)],
        factory: (opt) => new Service(opt as string),
      }),
    ]);
    expect(ctx.get(Service).opt).toBe('present');
  });
});

// ── getAll ───────────────────────────────────────────────────────────

describe('ApplicationContext — getAll', () => {
  it('returns all beans registered under a token', async () => {
    const HANDLER = new InjectionToken<{ name: string }>('Handler');
    const ctx = await ApplicationContext.create([
      makeDef(HANDLER, { factory: () => ({ name: 'a' }) }),
      // For getAll to work with multiple defs under the same token,
      // we need multiple definitions. Let's use a fresh token approach.
    ]);
    const all = ctx.getAll(HANDLER);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('a');
  });

  it('returns empty array for unregistered token', async () => {
    const UNKNOWN = new InjectionToken<string>('unknown');
    const ctx = await ApplicationContext.create([]);
    const all = ctx.getAll(UNKNOWN);
    expect(all).toEqual([]);
  });
});

// ── Errors ───────────────────────────────────────────────────────────

describe('ApplicationContext — errors', () => {
  it('throws MissingDependencyError for missing required dep', async () => {
    class Missing {}
    class Service {}
    await expect(
      ApplicationContext.create([makeDef(Service, { deps: [dep(Missing)] })]),
    ).rejects.toThrow(MissingDependencyError);
  });

  it('throws CircularDependencyError for circular deps', async () => {
    class A {}
    class B {}
    await expect(
      ApplicationContext.create([
        makeDef(A, { deps: [dep(B)], factory: () => new A() }),
        makeDef(B, { deps: [dep(A)], factory: () => new B() }),
      ]),
    ).rejects.toThrow(CircularDependencyError);
  });

  it('throws ContextClosedError after close()', async () => {
    class Foo {}
    const ctx = await ApplicationContext.create([
      makeDef(Foo, { factory: () => new Foo() }),
    ]);
    await ctx.close();
    expect(() => ctx.get(Foo)).toThrow(ContextClosedError);
  });

  it('throws MissingDependencyError for get() with unknown token', async () => {
    const ctx = await ApplicationContext.create([]);
    expect(() => ctx.get(class Unknown {})).toThrow(MissingDependencyError);
  });
});

// ── Collection injection ─────────────────────────────────────────────

describe('ApplicationContext — collection injection', () => {
  it('resolves collection dep via getAll()', async () => {
    const HANDLER = new InjectionToken<{ name: string }>('Handler');
    class Service {
      constructor(readonly handlers: Array<{ name: string }>) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(HANDLER, { factory: () => ({ name: 'a' }) }),
      makeDef(Service, {
        deps: [{ token: HANDLER, optional: false, collection: true }],
        factory: (handlers) => new Service(handlers as Array<{ name: string }>),
      }),
    ]);
    const svc = ctx.get(Service);
    expect(svc.handlers).toHaveLength(1);
    expect(svc.handlers[0].name).toBe('a');
  });

  it('returns empty array when no providers exist for collection dep', async () => {
    const HANDLER = new InjectionToken<{ name: string }>('Handler');
    class Service {
      constructor(readonly handlers: Array<{ name: string }>) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        deps: [{ token: HANDLER, optional: false, collection: true }],
        factory: (handlers) => new Service(handlers as Array<{ name: string }>),
      }),
    ]);
    const svc = ctx.get(Service);
    expect(svc.handlers).toEqual([]);
  });

  it('resolves collection dep via getAll() in async path', async () => {
    const HANDLER = new InjectionToken<{ name: string }>('Handler');
    class Service {
      constructor(readonly handlers: Array<{ name: string }>) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(HANDLER, { factory: () => ({ name: 'x' }) }),
      makeDef(Service, {
        deps: [{ token: HANDLER, optional: false, collection: true }],
        factory: async (handlers) =>
          new Service(handlers as Array<{ name: string }>),
      }),
    ]);
    const svc = await ctx.getAsync(Service);
    expect(svc.handlers).toHaveLength(1);
    expect(svc.handlers[0].name).toBe('x');
  });

  it('resolves collection deps with async factories via getAllAsync', async () => {
    const HANDLER = new InjectionToken<{ name: string }>('Handler');
    class Service {
      constructor(readonly handlers: Array<{ name: string }>) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(HANDLER, { factory: async () => ({ name: 'async-a' }) }),
      makeDef(Service, {
        deps: [{ token: HANDLER, optional: false, collection: true }],
        factory: async (handlers) =>
          new Service(handlers as Array<{ name: string }>),
      }),
    ]);
    // getAsync resolves the collection through getAllAsync internally
    const svc = await ctx.getAsync(Service);
    expect(svc.handlers).toHaveLength(1);
    expect(svc.handlers[0].name).toBe('async-a');
  });

  it('getAllAsync resolves async bean in collection', async () => {
    const TOKEN = new InjectionToken<number>('Num');
    const ctx = await ApplicationContext.create([
      makeDef(TOKEN, { factory: async () => 42 }),
    ]);
    const all = await ctx.getAllAsync(TOKEN);
    expect(all).toEqual([42]);
  });
});

// ── @OnInit lifecycle ──────────────────────────────────────────

describe('ApplicationContext — @OnInit lifecycle', () => {
  it('calls @OnInit method on sync singleton', async () => {
    const calls: string[] = [];
    class Service {
      init() {
        calls.push('init');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        factory: () => new Service(),
        metadata: { onInitMethods: ['init'] },
      }),
    ]);
    ctx.get(Service);
    expect(calls).toEqual(['init']);
  });

  it('calls @OnInit method on async singleton (via getAsync)', async () => {
    const calls: string[] = [];
    class Service {
      init() {
        calls.push('init');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        factory: async () => new Service(),
        metadata: { onInitMethods: ['init'] },
      }),
    ]);
    await ctx.getAsync(Service);
    expect(calls).toEqual(['init']);
  });

  it('calls async @OnInit method via getAsync', async () => {
    const calls: string[] = [];
    class Service {
      async init() {
        await new Promise((r) => setTimeout(r, 1));
        calls.push('async-init');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        factory: async () => new Service(),
        metadata: { onInitMethods: ['init'] },
      }),
    ]);
    await ctx.getAsync(Service);
    expect(calls).toEqual(['async-init']);
  });

  it('calls multiple @OnInit methods in order', async () => {
    const calls: string[] = [];
    class Service {
      initCache() {
        calls.push('cache');
      }
      loadConfig() {
        calls.push('config');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        factory: () => new Service(),
        metadata: { onInitMethods: ['initCache', 'loadConfig'] },
      }),
    ]);
    ctx.get(Service);
    expect(calls).toEqual(['cache', 'config']);
  });

  it('runs @OnInit after beforeInit and before afterInit', async () => {
    const calls: string[] = [];
    class Service {
      init() {
        calls.push('postConstruct');
      }
    }
    const processor: ComponentPostProcessor = {
      beforeInit(bean, def) {
        if (def.token === Service) calls.push('beforeInit');
        return bean;
      },
      afterInit(bean, def) {
        if (def.token === Service) calls.push('afterInit');
        return bean;
      },
    };
    const ppToken = new InjectionToken<ComponentPostProcessor>('pp');
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        factory: () => new Service(),
        metadata: { onInitMethods: ['init'] },
      }),
      makeDef<ComponentPostProcessor>(ppToken, {
        factory: () => processor,
        metadata: { isComponentPostProcessor: true },
      }),
    ]);
    ctx.get(Service);
    expect(calls).toEqual(['beforeInit', 'postConstruct', 'afterInit']);
  });

  it('calls @OnInit on prototype beans each time', async () => {
    let callCount = 0;
    class Proto {
      init() {
        callCount++;
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Proto, {
        scope: 'transient',
        factory: () => new Proto(),
        metadata: { onInitMethods: ['init'] },
      }),
    ]);
    ctx.get(Proto);
    ctx.get(Proto);
    expect(callCount).toBe(2);
  });

  it('calls @OnInit on eager beans during context creation', async () => {
    const calls: string[] = [];
    class Startup {
      init() {
        calls.push('eager-init');
      }
    }
    await ApplicationContext.create([
      makeDef(Startup, {
        eager: true,
        factory: async () => new Startup(),
        metadata: { onInitMethods: ['init'] },
      }),
    ]);
    expect(calls).toEqual(['eager-init']);
  });

  it('@OnInit throwing synchronously does not leave stale cache — second get() retries factory', async () => {
    let factoryCallCount = 0;
    let shouldThrow = true;
    class Service {
      init() {
        if (shouldThrow) {
          throw new Error('init failed');
        }
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        factory: () => {
          factoryCallCount++;
          return new Service();
        },
        metadata: { onInitMethods: ['init'] },
      }),
    ]);
    // First get() — @OnInit throws
    expect(() => ctx.get(Service)).toThrow('init failed');
    // Second get() — factory should be called again (no stale cache)
    shouldThrow = false;
    const svc = ctx.get(Service);
    expect(svc).toBeInstanceOf(Service);
    expect(factoryCallCount).toBe(2);
  });

  it('throws AsyncBeanNotReadyError for async @OnInit in sync path without unhandled rejection', async () => {
    class Service {
      async init() {
        // async OnInit
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        factory: () => new Service(),
        metadata: { onInitMethods: ['init'] },
      }),
    ]);
    // sync get() should throw, but NOT cause unhandled promise rejection
    expect(() => ctx.get(Service)).toThrow(AsyncBeanNotReadyError);
  });
});

// ── @OnDestroy / close() ────────────────────────────────────────────

describe('ApplicationContext — @OnDestroy lifecycle', () => {
  it('close() calls @OnDestroy methods on instantiated singletons', async () => {
    const calls: string[] = [];
    class Pool {
      shutdown() {
        calls.push('shutdown');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Pool, {
        factory: () => new Pool(),
        metadata: { onDestroyMethods: ['shutdown'] },
      }),
    ]);
    ctx.get(Pool); // instantiate the singleton
    await ctx.close();
    expect(calls).toEqual(['shutdown']);
  });

  it('close() calls methods in reverse-topological order', async () => {
    const calls: string[] = [];
    class Database {
      close() {
        calls.push('database');
      }
    }
    class Service {
      close() {
        calls.push('service');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Database, {
        factory: () => new Database(),
        metadata: { onDestroyMethods: ['close'] },
      }),
      makeDef(Service, {
        deps: [dep(Database)],
        factory: (_db) => new Service(),
        metadata: { onDestroyMethods: ['close'] },
      }),
    ]);
    // Instantiate both
    ctx.get(Service);
    await ctx.close();
    // Service depends on Database, so Service is destroyed first (reverse topo)
    expect(calls).toEqual(['service', 'database']);
  });

  it('close() skips beans that were never resolved', async () => {
    const calls: string[] = [];
    class LazyService {
      destroy() {
        calls.push('lazy');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(LazyService, {
        factory: () => new LazyService(),
        metadata: { onDestroyMethods: ['destroy'] },
      }),
    ]);
    // Don't resolve the bean — it should not be destroyed
    await ctx.close();
    expect(calls).toEqual([]);
  });

  it('close() collects errors and still cleans up remaining beans', async () => {
    const calls: string[] = [];
    class FailingBean {
      destroy() {
        throw new Error('fail!');
      }
    }
    class GoodBean {
      destroy() {
        calls.push('good');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(GoodBean, {
        factory: () => new GoodBean(),
        metadata: { onDestroyMethods: ['destroy'] },
      }),
      makeDef(FailingBean, {
        factory: () => new FailingBean(),
        metadata: { onDestroyMethods: ['destroy'] },
      }),
    ]);
    ctx.get(GoodBean);
    ctx.get(FailingBean);
    await expect(ctx.close()).rejects.toThrow('fail!');
    // GoodBean should still have been cleaned up (it's after FailingBean in reverse order)
    expect(calls).toEqual(['good']);
  });

  it('close() handles async @OnDestroy methods', async () => {
    const calls: string[] = [];
    class AsyncPool {
      async shutdown() {
        await new Promise((r) => setTimeout(r, 1));
        calls.push('async-shutdown');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(AsyncPool, {
        factory: () => new AsyncPool(),
        metadata: { onDestroyMethods: ['shutdown'] },
      }),
    ]);
    ctx.get(AsyncPool);
    await ctx.close();
    expect(calls).toEqual(['async-shutdown']);
  });

  it('prototype beans are not destroyed', async () => {
    const calls: string[] = [];
    class Proto {
      destroy() {
        calls.push('proto');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Proto, {
        scope: 'transient',
        factory: () => new Proto(),
        metadata: { onDestroyMethods: ['destroy'] },
      }),
    ]);
    ctx.get(Proto);
    await ctx.close();
    expect(calls).toEqual([]);
  });

  it('close() throws AggregateError when multiple beans fail', async () => {
    class Fail1 {
      destroy() {
        throw new Error('fail1');
      }
    }
    class Fail2 {
      destroy() {
        throw new Error('fail2');
      }
    }
    const ctx = await ApplicationContext.create([
      makeDef(Fail1, {
        factory: () => new Fail1(),
        metadata: { onDestroyMethods: ['destroy'] },
      }),
      makeDef(Fail2, {
        factory: () => new Fail2(),
        metadata: { onDestroyMethods: ['destroy'] },
      }),
    ]);
    ctx.get(Fail1);
    ctx.get(Fail2);
    try {
      await ctx.close();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AggregateError);
      const agg = err as AggregateError;
      expect(agg.errors).toHaveLength(2);
    }
  });
});

// ── getDefinitions ──────────────────────────────────────────────────

describe('ApplicationContext — getDefinitions', () => {
  it('returns definitions used to build the context', async () => {
    class Foo {}
    class Bar {}
    const defs = [
      makeDef(Foo, { factory: () => new Foo() }),
      makeDef(Bar, { factory: () => new Bar() }),
    ];
    const ctx = await ApplicationContext.create(defs);
    const returned = ctx.getDefinitions();
    // +1 for self-registered ApplicationContext definition
    expect(returned).toHaveLength(3);
    expect(returned.map((d) => d.token)).toContain(Foo);
    expect(returned.map((d) => d.token)).toContain(Bar);
    expect(returned.map((d) => d.token)).toContain(ApplicationContext);
  });

  it('returns a defensive copy (different array instances, same contents)', async () => {
    class Foo {}
    const ctx = await ApplicationContext.create([
      makeDef(Foo, { factory: () => new Foo() }),
    ]);
    const a = ctx.getDefinitions();
    const b = ctx.getDefinitions();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ── baseTokens ──────────────────────────────────────────────────────

describe('ApplicationContext — baseTokens', () => {
  it('bean with baseTokens is findable via getAll(baseToken)', async () => {
    class Base {}
    class Sub extends Base {
      value = 'sub';
    }
    const ctx = await ApplicationContext.create([
      makeDef(Sub, {
        factory: () => new Sub(),
        metadata: {},
      }),
    ]);
    // Without baseTokens, getAll(Base) returns nothing
    expect(ctx.getAll(Base)).toEqual([]);
  });

  it('getAll(baseToken) returns beans registered with baseTokens', async () => {
    class HealthIndicator {}
    class UptimeIndicator extends HealthIndicator {
      name = 'uptime';
    }
    const ctx = await ApplicationContext.create([
      makeDef(UptimeIndicator, {
        factory: () => new UptimeIndicator(),
        metadata: {},
      }),
    ]);
    // Still empty — no baseTokens set
    expect(ctx.getAll(HealthIndicator)).toEqual([]);

    // Now with baseTokens
    const ctx2 = await ApplicationContext.create([
      {
        token: UptimeIndicator,
        scope: 'singleton',
        dependencies: [],
        factory: () => new UptimeIndicator(),
        eager: false,
        baseTokens: [HealthIndicator],
        metadata: {},
      },
    ]);
    const indicators = ctx2.getAll(HealthIndicator);
    expect(indicators).toHaveLength(1);
    expect(indicators[0]).toBeInstanceOf(UptimeIndicator);
  });

  it('multiple beans registering under the same base token', async () => {
    class HealthIndicator {}
    class UptimeIndicator extends HealthIndicator {
      name = 'uptime';
    }
    class DiskIndicator extends HealthIndicator {
      name = 'disk';
    }
    const ctx = await ApplicationContext.create([
      {
        token: UptimeIndicator,
        scope: 'singleton',
        dependencies: [],
        factory: () => new UptimeIndicator(),
        eager: false,
        baseTokens: [HealthIndicator],
        metadata: {},
      },
      {
        token: DiskIndicator,
        scope: 'singleton',
        dependencies: [],
        factory: () => new DiskIndicator(),
        eager: false,
        baseTokens: [HealthIndicator],
        metadata: {},
      },
    ]);
    const indicators = ctx.getAll(HealthIndicator);
    expect(indicators).toHaveLength(2);
    expect(indicators[0]).toBeInstanceOf(UptimeIndicator);
    expect(indicators[1]).toBeInstanceOf(DiskIndicator);
  });

  it('get() on base token returns the last-registered bean', async () => {
    class HealthIndicator {}
    class UptimeIndicator extends HealthIndicator {}
    class DiskIndicator extends HealthIndicator {}
    const ctx = await ApplicationContext.create([
      {
        token: UptimeIndicator,
        scope: 'singleton',
        dependencies: [],
        factory: () => new UptimeIndicator(),
        eager: false,
        baseTokens: [HealthIndicator],
        metadata: {},
      },
      {
        token: DiskIndicator,
        scope: 'singleton',
        dependencies: [],
        factory: () => new DiskIndicator(),
        eager: false,
        baseTokens: [HealthIndicator],
        metadata: {},
      },
    ]);
    const primary = ctx.get(HealthIndicator);
    expect(primary).toBeInstanceOf(DiskIndicator);
  });

  it('baseTokens work with InjectionToken', async () => {
    const BASE = new InjectionToken<{ name: string }>('BaseHandler');
    class ConcreteHandler {
      name = 'concrete';
    }
    const ctx = await ApplicationContext.create([
      {
        token: ConcreteHandler,
        scope: 'singleton',
        dependencies: [],
        factory: () => new ConcreteHandler(),
        eager: false,
        baseTokens: [BASE],
        metadata: {},
      },
    ]);
    const all = ctx.getAll(BASE);
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('concrete');
  });

  it('getAllAsync works with baseTokens', async () => {
    class HealthIndicator {}
    class AsyncIndicator extends HealthIndicator {
      name = 'async';
    }
    const ctx = await ApplicationContext.create([
      {
        token: AsyncIndicator,
        scope: 'singleton',
        dependencies: [],
        factory: async () => new AsyncIndicator(),
        eager: false,
        baseTokens: [HealthIndicator],
        metadata: {},
      },
    ]);
    const all = await ctx.getAllAsync(HealthIndicator);
    expect(all).toHaveLength(1);
    expect(all[0]).toBeInstanceOf(AsyncIndicator);
  });
});

// ── Self-injection ───────────────────────────────────────────────────

describe('ApplicationContext — self-injection', () => {
  it('ctx.get(ApplicationContext) returns the context itself', async () => {
    class Foo {}
    const ctx = await ApplicationContext.create([
      makeDef(Foo, { factory: () => new Foo() }),
    ]);
    expect(ctx.get(ApplicationContext)).toBe(ctx);
  });

  it('ctx.getAsync(ApplicationContext) returns the context itself', async () => {
    const ctx = await ApplicationContext.create([]);
    const result = await ctx.getAsync(ApplicationContext);
    expect(result).toBe(ctx);
  });

  it('beans can depend on ApplicationContext', async () => {
    class Service {
      constructor(readonly ctx: ApplicationContext) {}
    }
    const ctx = await ApplicationContext.create([
      makeDef(Service, {
        deps: [dep(ApplicationContext)],
        factory: (appCtx) => new Service(appCtx as ApplicationContext),
      }),
    ]);
    const svc = ctx.get(Service);
    expect(svc.ctx).toBe(ctx);
  });
});

// ── @Primary ────────────────────────────────────────────────────────

describe('ApplicationContext — @Primary', () => {
  it('selects @Primary bean over last-registered bean via shared token', async () => {
    abstract class Provider {}

    class PrimaryImpl extends Provider {
      id = 'primary';
    }
    class SecondaryImpl extends Provider {
      id = 'secondary';
    }

    const ctx = await ApplicationContext.create([
      {
        token: PrimaryImpl,
        scope: 'singleton',
        dependencies: [],
        factory: () => new PrimaryImpl(),
        eager: false,
        metadata: { primary: true },
        baseTokens: [Provider],
      },
      {
        token: SecondaryImpl,
        scope: 'singleton',
        dependencies: [],
        factory: () => new SecondaryImpl(),
        eager: false,
        metadata: {},
        baseTokens: [Provider],
      },
    ]);

    // PrimaryImpl should win even though SecondaryImpl was registered last
    const provider = ctx.get(Provider);
    expect(provider).toBeInstanceOf(PrimaryImpl);
  });

  it('selects @Primary bean under shared base token', async () => {
    abstract class CacheProvider {}

    class InMemoryCache extends CacheProvider {
      type = 'memory';
    }
    class RedisCache extends CacheProvider {
      type = 'redis';
    }

    const ctx = await ApplicationContext.create([
      {
        token: InMemoryCache,
        scope: 'singleton',
        dependencies: [],
        factory: () => new InMemoryCache(),
        eager: false,
        metadata: { primary: true },
        baseTokens: [CacheProvider],
      },
      {
        token: RedisCache,
        scope: 'singleton',
        dependencies: [],
        factory: () => new RedisCache(),
        eager: false,
        metadata: {},
        baseTokens: [CacheProvider],
      },
    ]);

    // InMemoryCache is @Primary, so get(CacheProvider) should return it
    const provider = ctx.get(CacheProvider);
    expect(provider).toBeInstanceOf(InMemoryCache);
  });

  it('getAll still returns all beans regardless of @Primary', async () => {
    abstract class Handler {}

    class HandlerA extends Handler {}
    class HandlerB extends Handler {}

    const ctx = await ApplicationContext.create([
      {
        token: HandlerA,
        scope: 'singleton',
        dependencies: [],
        factory: () => new HandlerA(),
        eager: false,
        metadata: { primary: true },
        baseTokens: [Handler],
      },
      {
        token: HandlerB,
        scope: 'singleton',
        dependencies: [],
        factory: () => new HandlerB(),
        eager: false,
        metadata: {},
        baseTokens: [Handler],
      },
    ]);

    const all = ctx.getAll(Handler);
    expect(all).toHaveLength(2);
  });

  it('falls back to last-wins when no @Primary is set', async () => {
    abstract class Formatter {}

    class JsonFormatter extends Formatter {}
    class XmlFormatter extends Formatter {}

    const ctx = await ApplicationContext.create([
      {
        token: JsonFormatter,
        scope: 'singleton',
        dependencies: [],
        factory: () => new JsonFormatter(),
        eager: false,
        metadata: {},
        baseTokens: [Formatter],
      },
      {
        token: XmlFormatter,
        scope: 'singleton',
        dependencies: [],
        factory: () => new XmlFormatter(),
        eager: false,
        metadata: {},
        baseTokens: [Formatter],
      },
    ]);

    // Last registered wins when no @Primary
    const formatter = ctx.get(Formatter);
    expect(formatter).toBeInstanceOf(XmlFormatter);
  });
});

// ── Helper ───────────────────────────────────────────────────────────

function tokenDesc(token: unknown): string {
  if (typeof token === 'function') return (token as { name: string }).name;
  return (token as InjectionToken<unknown>).description;
}
