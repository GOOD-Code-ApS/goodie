import {
  ApplicationContext,
  type BeanDefinition,
  type Dependency,
  InjectionToken,
  OverrideError,
  type Scope,
} from '@goodie/core';
import { TestContext } from '@goodie/testing';
import { describe, expect, it } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────────────

function dep(token: Dependency['token'], optional = false): Dependency {
  return { token, optional };
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

// ── TestContext.from() ───────────────────────────────────────────────

describe('TestContext.from()', () => {
  it('creates a builder from BeanDefinition[]', async () => {
    class Foo {
      value = 'original';
    }
    const defs = [makeDef(Foo, { factory: () => new Foo() })];
    const builder = TestContext.from(defs);
    const ctx = await builder.build();
    expect(ctx.get(Foo)).toBeInstanceOf(Foo);
    expect(ctx.get(Foo).value).toBe('original');
  });

  it('creates a builder from ApplicationContext', async () => {
    class Foo {
      value = 'original';
    }
    const original = await ApplicationContext.create([
      makeDef(Foo, { factory: () => new Foo() }),
    ]);
    const builder = TestContext.from(original);
    const ctx = await builder.build();
    expect(ctx.get(Foo)).toBeInstanceOf(Foo);
    expect(ctx.get(Foo).value).toBe('original');
  });

  it('produces independent builders from the same source', async () => {
    class Foo {
      constructor(readonly value: string) {}
    }
    const defs = [makeDef(Foo, { factory: () => new Foo('original') })];

    const builder1 = TestContext.from(defs);
    const builder2 = TestContext.from(defs);

    builder1.override(Foo).withValue(new Foo('override-1'));
    builder2.override(Foo).withValue(new Foo('override-2'));

    const ctx1 = await builder1.build();
    const ctx2 = await builder2.build();

    expect(ctx1.get(Foo).value).toBe('override-1');
    expect(ctx2.get(Foo).value).toBe('override-2');
  });
});

// ── override() validation ───────────────────────────────────────────

describe('override() validation', () => {
  it('throws OverrideError for a missing class token', () => {
    class Foo {}
    class NotRegistered {}
    const builder = TestContext.from([
      makeDef(Foo, { factory: () => new Foo() }),
    ]);
    expect(() => builder.override(NotRegistered)).toThrow(OverrideError);
  });

  it('throws OverrideError for a missing InjectionToken', () => {
    class Foo {}
    const MISSING = new InjectionToken<string>('MISSING');
    const builder = TestContext.from([
      makeDef(Foo, { factory: () => new Foo() }),
    ]);
    expect(() => builder.override(MISSING)).toThrow(OverrideError);
  });

  it('includes token name in error message', () => {
    class MyService {}
    const builder = TestContext.from([]);
    expect(() => builder.override(MyService)).toThrow('MyService');
  });
});

// ── withValue() ─────────────────────────────────────────────────────

describe('withValue()', () => {
  it('overrides a bean with a fixed value', async () => {
    class Foo {
      constructor(readonly value: string) {}
    }
    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo('original') }),
    ])
      .override(Foo)
      .withValue(new Foo('overridden'))
      .build();

    expect(ctx.get(Foo).value).toBe('overridden');
  });

  it('returns the exact instance provided', async () => {
    class Foo {}
    const instance = new Foo();
    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo() }),
    ])
      .override(Foo)
      .withValue(instance)
      .build();

    expect(ctx.get(Foo)).toBe(instance);
  });

  it('preserves non-overridden beans', async () => {
    class Foo {
      value = 'foo';
    }
    class Bar {
      value = 'bar';
    }
    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo() }),
      makeDef(Bar, { factory: () => new Bar() }),
    ])
      .override(Foo)
      .withValue(new Foo())
      .build();

    expect(ctx.get(Bar).value).toBe('bar');
  });

  it('dependents receive the overridden bean', async () => {
    class Repo {
      constructor(readonly name: string) {}
    }
    class Service {
      constructor(readonly repo: Repo) {}
    }
    const ctx = await TestContext.from([
      makeDef(Repo, { factory: () => new Repo('real') }),
      makeDef(Service, {
        deps: [dep(Repo)],
        factory: (r) => new Service(r as Repo),
      }),
    ])
      .override(Repo)
      .withValue(new Repo('fake'))
      .build();

    expect(ctx.get(Service).repo.name).toBe('fake');
  });
});

// ── with() ──────────────────────────────────────────────────────────

describe('with()', () => {
  it('instantiates replacement class', async () => {
    class Original {
      kind = 'original';
    }
    class Replacement {
      kind = 'replacement';
    }
    const ctx = await TestContext.from([
      makeDef(Original, { factory: () => new Original() }),
    ])
      .override(Original)
      .with(Replacement as unknown as typeof Original)
      .build();

    expect((ctx.get(Original) as unknown as Replacement).kind).toBe(
      'replacement',
    );
  });

  it('does not use the original factory', async () => {
    let originalCalled = false;
    class Foo {
      value = 'default';
    }
    class FakeFoo {
      value = 'fake';
    }

    const ctx = await TestContext.from([
      makeDef(Foo, {
        factory: () => {
          originalCalled = true;
          return new Foo();
        },
      }),
    ])
      .override(Foo)
      .with(FakeFoo as unknown as typeof Foo)
      .build();

    ctx.get(Foo);
    expect(originalCalled).toBe(false);
  });
});

// ── withFactory() ───────────────────────────────────────────────────

describe('withFactory()', () => {
  it('uses a custom sync factory', async () => {
    class Foo {
      constructor(readonly value: string) {}
    }
    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo('original') }),
    ])
      .override(Foo)
      .withFactory(() => new Foo('from-factory'))
      .build();

    expect(ctx.get(Foo).value).toBe('from-factory');
  });

  it('uses a custom async factory', async () => {
    class Foo {
      constructor(readonly value: string) {}
    }
    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo('original') }),
    ])
      .override(Foo)
      .withFactory(async () => new Foo('async-factory'))
      .build();

    const foo = await ctx.getAsync(Foo);
    expect(foo.value).toBe('async-factory');
  });
});

// ── multiple overrides ──────────────────────────────────────────────

describe('multiple overrides', () => {
  it('chains multiple overrides for different beans', async () => {
    class Foo {
      constructor(readonly value: string) {}
    }
    class Bar {
      constructor(readonly value: string) {}
    }
    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo('foo-orig') }),
      makeDef(Bar, { factory: () => new Bar('bar-orig') }),
    ])
      .override(Foo)
      .withValue(new Foo('foo-override'))
      .override(Bar)
      .withValue(new Bar('bar-override'))
      .build();

    expect(ctx.get(Foo).value).toBe('foo-override');
    expect(ctx.get(Bar).value).toBe('bar-override');
  });

  it('later override replaces earlier override for same token', async () => {
    class Foo {
      constructor(readonly value: string) {}
    }
    const builder = TestContext.from([
      makeDef(Foo, { factory: () => new Foo('original') }),
    ]);
    builder.override(Foo).withValue(new Foo('first'));
    builder.override(Foo).withValue(new Foo('second'));

    const ctx = await builder.build();
    expect(ctx.get(Foo).value).toBe('second');
  });
});

// ── build() ─────────────────────────────────────────────────────────

describe('build()', () => {
  it('returns a functional ApplicationContext', async () => {
    class Foo {
      value = 42;
    }
    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo() }),
    ]).build();

    expect(ctx.get(Foo).value).toBe(42);
  });

  it('produces independent contexts per build()', async () => {
    class Counter {
      count = 0;
    }
    const builder = TestContext.from([
      makeDef(Counter, { factory: () => new Counter() }),
    ]);

    const ctx1 = await builder.build();
    const ctx2 = await builder.build();

    ctx1.get(Counter).count = 10;
    expect(ctx2.get(Counter).count).toBe(0);
  });

  it('preserves prototype scope for non-overridden beans', async () => {
    class Proto {}
    class Other {
      value = 'other';
    }
    const ctx = await TestContext.from([
      makeDef(Proto, { scope: 'prototype', factory: () => new Proto() }),
      makeDef(Other, { factory: () => new Other() }),
    ])
      .override(Other)
      .withValue(new Other())
      .build();

    expect(ctx.get(Proto)).not.toBe(ctx.get(Proto));
  });
});

// ── InjectionToken overrides ────────────────────────────────────────

describe('InjectionToken overrides', () => {
  it('withValue on InjectionToken', async () => {
    const DB_URL = new InjectionToken<string>('DB_URL');
    const ctx = await TestContext.from([
      makeDef<string>(DB_URL, { factory: () => 'postgres://prod' }),
    ])
      .override(DB_URL)
      .withValue('postgres://test')
      .build();

    expect(ctx.get(DB_URL)).toBe('postgres://test');
  });

  it('withFactory on InjectionToken', async () => {
    const CONFIG = new InjectionToken<{ env: string }>('CONFIG');
    const ctx = await TestContext.from([
      makeDef(CONFIG, { factory: () => ({ env: 'prod' }) }),
    ])
      .override(CONFIG)
      .withFactory(() => ({ env: 'test' }))
      .build();

    expect(ctx.get(CONFIG).env).toBe('test');
  });
});
