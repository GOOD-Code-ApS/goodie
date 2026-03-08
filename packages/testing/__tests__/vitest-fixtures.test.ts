import {
  type BeanDefinition,
  type Dependency,
  InjectionToken,
  type Scope,
} from '@goodie-ts/core';
import { createGoodieTest } from '@goodie-ts/testing/vitest';
import { describe, expect } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────────────

function dep(token: Dependency['token'], optional = false): Dependency {
  return { token, optional, collection: false };
}

function makeDef<T>(
  token: BeanDefinition<T>['token'],
  opts: {
    deps?: Dependency[];
    factory?: (...args: unknown[]) => T | Promise<T>;
    scope?: Scope;
    eager?: boolean;
    metadata?: Record<string, unknown>;
  } = {},
): BeanDefinition<T> {
  return {
    token,
    scope: opts.scope ?? 'singleton',
    dependencies: opts.deps ?? [],
    factory: opts.factory ?? ((() => ({})) as () => T),
    eager: opts.eager ?? false,
    metadata: opts.metadata ?? {},
  };
}

// ── Test classes ─────────────────────────────────────────────────────

class Greeter {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

class Counter {
  count = 0;
  increment(): number {
    return ++this.count;
  }
}

const greeterDef = makeDef(Greeter, { factory: () => new Greeter() });
const counterDef = makeDef(Counter, { factory: () => new Counter() });

// ── Context lifecycle ────────────────────────────────────────────────

describe('createGoodieTest()', () => {
  describe('context lifecycle', () => {
    const test = createGoodieTest([greeterDef, counterDef]);

    test('builds context and resolves beans via ctx', ({ ctx }) => {
      const greeter = ctx.get(Greeter);
      expect(greeter).toBeInstanceOf(Greeter);
      expect(greeter.greet('World')).toBe('Hello, World!');
    });

    test('resolves multiple beans', ({ ctx }) => {
      const counter = ctx.get(Counter);
      expect(counter).toBeInstanceOf(Counter);
      expect(counter.increment()).toBe(1);
    });
  });

  // ── resolve() fixture ───────────────────────────────────────────

  describe('resolve() fixture', () => {
    const test = createGoodieTest([greeterDef]);

    test('resolves beans via resolve fixture', ({ resolve }) => {
      const greeter = resolve(Greeter);
      expect(greeter.greet('Fixture')).toBe('Hello, Fixture!');
    });

    test('returns same singleton instance', ({ resolve }) => {
      const a = resolve(Greeter);
      const b = resolve(Greeter);
      expect(a).toBe(b);
    });
  });

  // ── config as function ───────────────────────────────────────────

  describe('config as function', () => {
    const CONFIG_TOKEN = new InjectionToken<Record<string, unknown>>(
      '__Goodie_Config',
    );

    const configDef = makeDef(CONFIG_TOKEN, {
      factory: () => ({ DATABASE_URL: 'default' }),
    });

    const test = createGoodieTest([greeterDef, configDef], {
      config: () => ({ DATABASE_URL: 'lazy-value' }),
    });

    test('calls config function lazily and applies overrides', ({ ctx }) => {
      const config = ctx.get(CONFIG_TOKEN);
      expect(config.DATABASE_URL).toBe('lazy-value');
    });
  });

  // ── config as object ─────────────────────────────────────────────

  describe('config as object', () => {
    const CONFIG_TOKEN = new InjectionToken<Record<string, unknown>>(
      '__Goodie_Config',
    );

    const configDef = makeDef(CONFIG_TOKEN, {
      factory: () => ({ DATABASE_URL: 'default' }),
    });

    const test = createGoodieTest([greeterDef, configDef], {
      config: { DATABASE_URL: 'static-value' },
    });

    test('applies static config overrides', ({ ctx }) => {
      const config = ctx.get(CONFIG_TOKEN);
      expect(config.DATABASE_URL).toBe('static-value');
    });
  });

  // ── setup callback ───────────────────────────────────────────────

  describe('setup callback', () => {
    class FakeGreeter {
      greet(name: string): string {
        return `Fake: ${name}`;
      }
    }

    const test = createGoodieTest([greeterDef], {
      setup: (builder) =>
        builder.override(Greeter).withValue(new FakeGreeter() as Greeter),
    });

    test('uses the overridden bean', ({ ctx }) => {
      const greeter = ctx.get(Greeter);
      expect(greeter.greet('test')).toBe('Fake: test');
    });
  });

  // ── setup with provide() ────────────────────────────────────────

  describe('setup with provide()', () => {
    const AUTH_TOKEN = new InjectionToken<{ user: string }>('Auth');

    const test = createGoodieTest([greeterDef], {
      setup: (builder) => builder.provide(AUTH_TOKEN, { user: 'test-user' }),
    });

    test('resolves provided bean from setup', ({ ctx }) => {
      expect(ctx.get(AUTH_TOKEN).user).toBe('test-user');
    });
  });

  // ── resolve() with InjectionToken ────────────────────────────────

  describe('resolve() with InjectionToken', () => {
    interface Logger {
      log(msg: string): string;
    }
    const LOGGER_TOKEN = new InjectionToken<Logger>('Logger');
    const loggerDef = makeDef<Logger>(LOGGER_TOKEN, {
      factory: () => ({
        log: (msg: string) => `[LOG] ${msg}`,
      }),
    });

    const test = createGoodieTest([loggerDef]);

    test('resolves InjectionToken-based beans via fixture', ({ resolve }) => {
      const logger = resolve(LOGGER_TOKEN);
      expect(logger.log('hello')).toBe('[LOG] hello');
    });
  });

  // ── beans with dependencies ──────────────────────────────────────

  describe('beans with dependencies', () => {
    class Repository {
      findAll(): string[] {
        return ['item1', 'item2'];
      }
    }

    class Service {
      constructor(private readonly repo: Repository) {}
      getAll(): string[] {
        return this.repo.findAll();
      }
    }

    const repoDef = makeDef(Repository, { factory: () => new Repository() });
    const serviceDef = makeDef(Service, {
      deps: [dep(Repository)],
      factory: (repo: unknown) => new Service(repo as Repository),
    });

    const test = createGoodieTest([repoDef, serviceDef]);

    test('resolves beans with dependency injection', ({ resolve }) => {
      const svc = resolve(Service);
      expect(svc.getAll()).toEqual(['item1', 'item2']);
    });
  });

  // ── buildDefinitions function ───────────────────────────────────

  describe('buildDefinitions function', () => {
    const CONFIG_TOKEN = new InjectionToken<Record<string, unknown>>(
      '__Goodie_Config',
    );

    function buildDefinitions(
      config?: Record<string, unknown>,
    ): BeanDefinition[] {
      return [
        greeterDef,
        makeDef(CONFIG_TOKEN, {
          factory: () => ({ DB: 'default', ...config }),
        }),
      ];
    }

    const test = createGoodieTest(buildDefinitions, {
      config: () => ({ DB: 'test-db' }),
    });

    test('passes config to buildDefinitions function', ({ ctx }) => {
      const config = ctx.get(CONFIG_TOKEN);
      expect(config.DB).toBe('test-db');
    });
  });

  // ── custom fixtures ───────────────────────────────────────────

  describe('custom fixtures', () => {
    class Router {
      constructor(private readonly greeter: Greeter) {}
      handle(name: string): string {
        return this.greeter.greet(name);
      }
    }

    const test = createGoodieTest([greeterDef], {
      fixtures: {
        router: (ctx) => new Router(ctx.get(Greeter)),
      },
    });

    test('exposes custom fixtures alongside ctx and resolve', ({
      router,
      resolve,
    }) => {
      expect(router.handle('World')).toBe('Hello, World!');
      expect(resolve(Greeter)).toBeInstanceOf(Greeter);
    });
  });

  // ── multiple custom fixtures ──────────────────────────────────

  describe('multiple custom fixtures', () => {
    const test = createGoodieTest([greeterDef, counterDef], {
      fixtures: {
        greeting: (ctx) => ctx.get(Greeter).greet('fixture'),
        count: (ctx) => ctx.get(Counter).increment(),
      },
    });

    test('provides all custom fixtures', ({ greeting, count }) => {
      expect(greeting).toBe('Hello, fixture!');
      expect(count).toBe(1);
    });
  });

  // ── .skip / .only work natively ──────────────────────────────────

  describe('vitest integration', () => {
    const test = createGoodieTest([greeterDef]);

    test.skip('skipped tests work natively', ({ ctx: _ctx }) => {
      throw new Error('should not run');
    });

    test('regular tests still work', ({ ctx }) => {
      expect(ctx.get(Greeter).greet('vitest')).toBe('Hello, vitest!');
    });
  });
});
