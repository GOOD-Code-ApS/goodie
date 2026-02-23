import {
  type BeanDefinition,
  type Dependency,
  InjectionToken,
  OverrideError,
  type Scope,
} from '@goodie/core';
import {
  getMockTarget,
  MockDefinition,
  MockDefinitionError,
  TestContext,
} from '@goodie/testing';
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

// ── @MockDefinition metadata ─────────────────────────────────────────

describe('@MockDefinition metadata', () => {
  it('stores a Constructor target', () => {
    class Original {}

    @MockDefinition(Original)
    class MockOriginal {}

    expect(getMockTarget(MockOriginal)).toBe(Original);
  });

  it('stores an InjectionToken target', () => {
    const TOKEN = new InjectionToken<string>('SomeToken');

    @MockDefinition(TOKEN)
    class MockSomething {}

    expect(getMockTarget(MockSomething)).toBe(TOKEN);
  });

  it('stores a string target', () => {
    @MockDefinition('Repository<User>')
    class MockUserRepo {}

    expect(getMockTarget(MockUserRepo)).toBe('Repository<User>');
  });

  it('getMockTarget returns undefined for un-decorated class', () => {
    class Plain {}

    expect(getMockTarget(Plain)).toBeUndefined();
  });
});

// ── .mock() with Constructor target ──────────────────────────────────

describe('.mock() with Constructor target', () => {
  it('overrides the target class', async () => {
    class Repo {
      kind = 'real';
    }

    @MockDefinition(Repo)
    class MockRepo {
      kind = 'mock';
    }

    const ctx = await TestContext.from([
      makeDef(Repo, { factory: () => new Repo() }),
    ])
      .mock(MockRepo)
      .build();

    expect((ctx.get(Repo) as unknown as MockRepo).kind).toBe('mock');
  });

  it('mock is instantiated, not the original', async () => {
    let originalCalled = false;

    class Service {
      value = 'real';
    }

    @MockDefinition(Service)
    class MockService {
      value = 'mock';
    }

    const ctx = await TestContext.from([
      makeDef(Service, {
        factory: () => {
          originalCalled = true;
          return new Service();
        },
      }),
    ])
      .mock(MockService)
      .build();

    ctx.get(Service);
    expect(originalCalled).toBe(false);
  });

  it('dependents receive the mock', async () => {
    class Repo {
      constructor(readonly name: string) {}
    }
    class Service {
      constructor(readonly repo: Repo) {}
    }

    @MockDefinition(Repo)
    class MockRepo {
      name = 'mock-repo';
    }

    const ctx = await TestContext.from([
      makeDef(Repo, { factory: () => new Repo('real') }),
      makeDef(Service, {
        deps: [dep(Repo)],
        factory: (r) => new Service(r as Repo),
      }),
    ])
      .mock(MockRepo)
      .build();

    expect(ctx.get(Service).repo.name).toBe('mock-repo');
  });
});

// ── .mock() with string target ───────────────────────────────────────

describe('.mock() with string target', () => {
  it('resolves InjectionToken by description', async () => {
    const DB_URL = new InjectionToken<string>('DB_URL');

    @MockDefinition('DB_URL')
    class MockDbUrl {
      toString() {
        return 'postgres://test';
      }
    }

    const ctx = await TestContext.from([
      makeDef<string>(DB_URL, { factory: () => 'postgres://prod' }),
    ])
      .mock(MockDbUrl)
      .build();

    const result = ctx.get(DB_URL) as unknown as MockDbUrl;
    expect(result).toBeInstanceOf(MockDbUrl);
  });

  it('throws MockDefinitionError for unknown description', () => {
    @MockDefinition('NonExistent')
    class MockNonExistent {}

    const builder = TestContext.from([]);
    expect(() => builder.mock(MockNonExistent)).toThrow(MockDefinitionError);
    expect(() => builder.mock(MockNonExistent)).toThrow(
      'targets InjectionToken "NonExistent"',
    );
  });

  it('throws MockDefinitionError when multiple tokens share the same description', () => {
    const TOKEN_A = new InjectionToken<string>('SharedDesc');
    const TOKEN_B = new InjectionToken<number>('SharedDesc');

    @MockDefinition('SharedDesc')
    class MockShared {}

    const builder = TestContext.from([
      makeDef<string>(TOKEN_A, { factory: () => 'a' }),
      makeDef<number>(TOKEN_B, { factory: () => 42 }),
    ]);

    expect(() => builder.mock(MockShared)).toThrow(MockDefinitionError);
    expect(() => builder.mock(MockShared)).toThrow(
      '2 tokens share that description',
    );
  });
});

// ── .mock() errors ───────────────────────────────────────────────────

describe('.mock() errors', () => {
  it('throws MockDefinitionError for un-annotated class', () => {
    class NotAnnotated {}

    const builder = TestContext.from([]);
    expect(() => builder.mock(NotAnnotated)).toThrow(MockDefinitionError);
    expect(() => builder.mock(NotAnnotated)).toThrow(
      'NotAnnotated is not annotated with @MockDefinition',
    );
  });

  it('throws OverrideError for non-existent Constructor token', () => {
    class MissingBean {}

    @MockDefinition(MissingBean)
    class MockMissing {}

    const builder = TestContext.from([]);
    expect(() => builder.mock(MockMissing)).toThrow(OverrideError);
  });
});

// ── .mock() chaining ─────────────────────────────────────────────────

describe('.mock() chaining', () => {
  it('accepts multiple mocks in one call', async () => {
    class Foo {
      kind = 'real-foo';
    }
    class Bar {
      kind = 'real-bar';
    }

    @MockDefinition(Foo)
    class MockFoo {
      kind = 'mock-foo';
    }

    @MockDefinition(Bar)
    class MockBar {
      kind = 'mock-bar';
    }

    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo() }),
      makeDef(Bar, { factory: () => new Bar() }),
    ])
      .mock(MockFoo, MockBar)
      .build();

    expect((ctx.get(Foo) as unknown as MockFoo).kind).toBe('mock-foo');
    expect((ctx.get(Bar) as unknown as MockBar).kind).toBe('mock-bar');
  });

  it('supports chained .mock() calls', async () => {
    class Foo {
      kind = 'real-foo';
    }
    class Bar {
      kind = 'real-bar';
    }

    @MockDefinition(Foo)
    class MockFoo {
      kind = 'mock-foo';
    }

    @MockDefinition(Bar)
    class MockBar {
      kind = 'mock-bar';
    }

    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo() }),
      makeDef(Bar, { factory: () => new Bar() }),
    ])
      .mock(MockFoo)
      .mock(MockBar)
      .build();

    expect((ctx.get(Foo) as unknown as MockFoo).kind).toBe('mock-foo');
    expect((ctx.get(Bar) as unknown as MockBar).kind).toBe('mock-bar');
  });

  it('mixes .mock() with .override()', async () => {
    class Foo {
      constructor(readonly value: string) {}
    }
    class Bar {
      kind = 'real-bar';
    }

    @MockDefinition(Bar)
    class MockBar {
      kind = 'mock-bar';
    }

    const ctx = await TestContext.from([
      makeDef(Foo, { factory: () => new Foo('original') }),
      makeDef(Bar, { factory: () => new Bar() }),
    ])
      .override(Foo)
      .withValue(new Foo('overridden'))
      .mock(MockBar)
      .build();

    expect(ctx.get(Foo).value).toBe('overridden');
    expect((ctx.get(Bar) as unknown as MockBar).kind).toBe('mock-bar');
  });
});
