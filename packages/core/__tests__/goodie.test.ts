import { describe, expect, it } from 'vitest';
import { ApplicationContext } from '../src/application-context.js';
import type {
  ComponentDefinition,
  Dependency,
} from '../src/component-definition.js';
import { Goodie, GoodieBuilder } from '../src/goodie.js';
import { InjectionToken } from '../src/injection-token.js';
import type { Scope } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

function dep(token: Dependency['token'], optional = false): Dependency {
  return { token, optional };
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

// ── Tests ────────────────────────────────────────────────────────────

describe('Goodie Builder', () => {
  it('Goodie.build() returns a GoodieBuilder', () => {
    const builder = Goodie.build([]);
    expect(builder).toBeInstanceOf(GoodieBuilder);
  });

  it('start() returns an ApplicationContext', async () => {
    const ctx = await Goodie.build([]).start();
    expect(ctx).toBeInstanceOf(ApplicationContext);
    await ctx.close();
  });

  it('resolves a simple bean through the builder', async () => {
    class Greeter {
      greet() {
        return 'hello';
      }
    }

    const ctx = await Goodie.build([
      makeDef(Greeter, { factory: () => new Greeter() }),
    ]).start();

    const greeter = ctx.get(Greeter);
    expect(greeter.greet()).toBe('hello');
    await ctx.close();
  });

  it('resolves a dependency chain', async () => {
    class Repo {
      data = 'db-data';
    }
    class Service {
      constructor(readonly repo: Repo) {}
    }

    const ctx = await Goodie.build([
      makeDef(Repo, { factory: () => new Repo() }),
      makeDef(Service, {
        deps: [dep(Repo)],
        factory: (repo: unknown) => new Service(repo as Repo),
      }),
    ]).start();

    const svc = ctx.get(Service);
    expect(svc.repo.data).toBe('db-data');
    await ctx.close();
  });

  it('resolves InjectionToken beans', async () => {
    const DbUrl = new InjectionToken<string>('DbUrl');

    const ctx = await Goodie.build([
      makeDef(DbUrl, { factory: () => 'postgres://localhost' }),
    ]).start();

    const url = ctx.get(DbUrl);
    expect(url).toBe('postgres://localhost');
    await ctx.close();
  });

  it('supports chained usage (build then start)', async () => {
    class Config {
      port = 3000;
    }

    const builder = Goodie.build([
      makeDef(Config, { factory: () => new Config() }),
    ]);

    // Builder can be held and started later
    const ctx = await builder.start();
    expect(ctx.get(Config).port).toBe(3000);
    await ctx.close();
  });

  it('runs onStart hooks after context is created', async () => {
    class Service {
      started = false;
    }

    const hookCalls: string[] = [];
    const ctx = await Goodie.build([
      makeDef(Service, { factory: () => new Service() }),
    ])
      .onStart(async (ctx) => {
        hookCalls.push('hook1');
        ctx.get(Service).started = true;
      })
      .onStart(async () => {
        hookCalls.push('hook2');
      })
      .start();

    expect(ctx.get(Service).started).toBe(true);
    expect(hookCalls).toEqual(['hook1', 'hook2']);
    await ctx.close();
  });

  it('propagates errors from onStart hooks', async () => {
    const builder = Goodie.build([]).onStart(async () => {
      throw new Error('hook failed');
    });

    await expect(builder.start()).rejects.toThrow('hook failed');
  });

  it('closes context when an onStart hook throws', async () => {
    let destroyed = false;

    class Resource {
      destroy() {
        destroyed = true;
      }
    }

    const builder = Goodie.build([
      makeDef(Resource, {
        factory: () => new Resource(),
        eager: true,
        metadata: { onDestroyMethods: ['destroy'] },
      }),
    ]).onStart(async () => {
      throw new Error('hook failed');
    });

    await expect(builder.start()).rejects.toThrow('hook failed');
    expect(destroyed).toBe(true);
  });
});
