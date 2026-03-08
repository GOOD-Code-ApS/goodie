import type {
  AbstractConstructor,
  ApplicationContext,
  BeanDefinition,
  Constructor,
  InjectionToken,
} from '@goodie-ts/core';
import { test as base, type TestAPI } from 'vitest';
import { TestContext, type TestContextBuilder } from './test-context.js';

/** A function that builds bean definitions, optionally accepting config overrides. */
type DefinitionsFactory = (
  config?: Record<string, unknown>,
) => BeanDefinition[];

/** Input accepted by `createGoodieTest()` — either a definitions factory or a raw array. */
type DefinitionsInput = DefinitionsFactory | BeanDefinition[];

/**
 * Configuration options for `createGoodieTest()`.
 */
export interface GoodieTestOptions<
  TFixtures extends Record<string, unknown> = Record<string, never>,
> {
  /** Static config overrides, or a lazy function (useful for TestContainers URIs). */
  config?: Record<string, unknown> | (() => Record<string, unknown>);
  /** Escape hatch to customise the builder (e.g. `.override()`, `.mock()`). */
  setup?: (builder: TestContextBuilder) => TestContextBuilder;
  /**
   * Custom fixtures derived from the ApplicationContext.
   * Each entry is a factory `(ctx) => T` — the result is exposed as a test fixture.
   *
   * @example
   * ```typescript
   * const test = createGoodieTest(buildDefinitions, {
   *   fixtures: {
   *     app: (ctx) => createRouter(ctx),
   *   },
   * });
   *
   * test('GET /todos', async ({ app }) => {
   *   const res = await app.request('/api/todos');
   *   expect(res.status).toBe(200);
   * });
   * ```
   */
  fixtures?: {
    [K in keyof TFixtures]: (ctx: ApplicationContext) => TFixtures[K];
  };
  /**
   * Wrap each test in a transaction that rolls back after the test.
   * Pass the class or InjectionToken of your TransactionManager bean.
   * The resolved bean must have `startTestTransaction(): Promise<() => Promise<void>>`.
   */
  transactional?: Constructor | InjectionToken<any>;
  /** Whether to rollback after each test. Defaults to `true` when `transactional` is set. */
  rollback?: boolean;
}

/** Fixtures provided by `createGoodieTest()`. */
export interface GoodieFixtures {
  /** The built ApplicationContext. Built fresh per test, closed after. */
  ctx: ApplicationContext;
  /** Convenience function to resolve beans from the context. */
  resolve: <T>(
    token: Constructor<T> | AbstractConstructor<T> | InjectionToken<T>,
  ) => T;
}

/**
 * Duck-type contract for any transaction manager bean used in test rollback.
 * The resolved bean must provide `startTestTransaction()` which replaces
 * the internal DB connection with a transaction, and returns a rollback function.
 */
interface TestTransactionManagerLike {
  startTestTransaction(): Promise<() => Promise<void>>;
}

/**
 * Create a vitest-native `test` function with Playwright-style fixtures
 * that provide a built `ApplicationContext`, a `resolve` helper, and
 * any custom fixtures derived from the context.
 *
 * @example
 * ```typescript
 * // Basic usage with buildDefinitions function
 * const test = createGoodieTest(buildDefinitions, {
 *   config: () => ({ 'datasource.url': container.getConnectionUri() }),
 * });
 *
 * test('creates a user', async ({ resolve }) => {
 *   const svc = resolve(UserService);
 *   expect(svc).toBeInstanceOf(UserService);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With custom fixtures (e.g. Hono router)
 * const test = createGoodieTest(buildDefinitions, {
 *   fixtures: {
 *     app: (ctx) => createRouter(ctx),
 *   },
 * });
 *
 * test('GET /todos', async ({ app, resolve }) => {
 *   const res = await app.request('/api/todos');
 *   expect(res.status).toBe(200);
 * });
 * ```
 */
export function createGoodieTest<
  TFixtures extends Record<string, unknown> = Record<string, never>,
>(
  definitions: DefinitionsInput,
  options?: GoodieTestOptions<TFixtures>,
): TestAPI<GoodieFixtures & TFixtures> {
  const transactional = options?.transactional;
  const rollback = options?.rollback ?? !!transactional;

  // Resolve definitions once (lazily on first test) and reuse across all tests.
  // This ensures all tests share the same BeanDefinition[] reference, which is
  // critical for transactional rollback — tests must share the same connection pool.
  // Note: config() is also evaluated once here and frozen for all tests.
  let cachedDefs: BeanDefinition[] | undefined;
  function resolveDefinitions(): BeanDefinition[] {
    if (cachedDefs) return cachedDefs;

    const configValue = options?.config
      ? typeof options.config === 'function'
        ? options.config()
        : options.config
      : undefined;

    if (typeof definitions === 'function') {
      cachedDefs = definitions(configValue);
    } else {
      cachedDefs = definitions;
    }

    return cachedDefs;
  }

  // Build fixture entries from user-provided fixture factories.
  // Each fixture depends on `ctx` and is exposed as a test fixture.
  function buildCustomFixtures(): Record<string, unknown> {
    if (!options?.fixtures) return {};
    const entries: Record<string, unknown> = {};
    for (const [name, factory] of Object.entries(options.fixtures)) {
      entries[name] = async (
        { ctx }: { ctx: ApplicationContext },
        use: (value: unknown) => Promise<void>,
      ) => {
        await use((factory as (ctx: ApplicationContext) => unknown)(ctx));
      };
    }
    return entries;
  }

  const baseFixtures: Record<string, unknown> = {
    ctx: async (
      // biome-ignore lint/correctness/noEmptyPattern: vitest requires destructuring syntax
      {}: Record<string, never>,
      use: (value: ApplicationContext) => Promise<void>,
    ) => {
      const defs = resolveDefinitions();
      let builder: TestContextBuilder = TestContext.from(defs);

      // When definitions is a raw array, apply config via withConfig().
      if (options?.config && typeof definitions !== 'function') {
        const configValue =
          typeof options.config === 'function'
            ? options.config()
            : options.config;
        builder = builder.withConfig(configValue);
      }

      if (options?.setup) {
        builder = options.setup(builder);
      }

      const ctx = await builder.build();
      await use(ctx);
      await ctx.close();
    },

    resolve: async (
      { ctx }: { ctx: ApplicationContext },
      use: (
        value: <T>(
          token: Constructor<T> | AbstractConstructor<T> | InjectionToken<T>,
        ) => T,
      ) => Promise<void>,
    ) => {
      await use(
        <T>(
          token: Constructor<T> | AbstractConstructor<T> | InjectionToken<T>,
        ) => ctx.get(token),
      );
    },
  };

  // Vitest's Fixtures type uses complex mapped types that don't play well with
  // dynamic fixture objects. We use `as any` at the `.extend()` boundary — the
  // return type cast to `TestAPI<GoodieFixtures & TFixtures>` ensures callers
  // get full type safety on the fixtures they declared.

  // When not using transactional mode, include custom fixtures directly.
  if (!transactional || !rollback) {
    return base.extend({
      ...baseFixtures,
      ...buildCustomFixtures(),
    } as any) as TestAPI<GoodieFixtures & TFixtures>;
  }

  // With transactional mode: three layers of .extend() ensure correct ordering:
  //   1. baseFixtures (ctx, resolve)
  //   2. _rollback (auto) — starts the transaction
  //   3. custom fixtures — run inside the transaction
  const transactionalToken = transactional;

  const withRollback = base.extend(baseFixtures as any).extend({
    _rollback: [
      async (
        { ctx }: { ctx: ApplicationContext },
        use: () => Promise<void>,
      ) => {
        const tm = ctx.get(transactionalToken) as TestTransactionManagerLike;
        const rollbackFn = await tm.startTestTransaction();
        try {
          await use();
        } finally {
          await rollbackFn();
        }
      },
      { auto: true },
    ],
  } as any);

  const customFixtures = buildCustomFixtures();
  if (Object.keys(customFixtures).length === 0) {
    return withRollback as TestAPI<GoodieFixtures & TFixtures>;
  }

  return withRollback.extend(customFixtures as any) as TestAPI<
    GoodieFixtures & TFixtures
  >;
}
