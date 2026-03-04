import type {
  AbstractConstructor,
  ApplicationContext,
  BeanDefinition,
  Constructor,
  InjectionToken,
} from '@goodie-ts/core';
import { test as base, type TestAPI } from 'vitest';
import { TestContext, type TestContextBuilder } from './test-context.js';

/**
 * Configuration options for `createGoodieTest()`.
 */
export interface GoodieTestOptions {
  /** Static config overrides, or a lazy function (useful for TestContainers URIs). */
  config?: Record<string, unknown> | (() => Record<string, unknown>);
  /** Escape hatch to customise the builder (e.g. `.override()`, `.mock()`). */
  setup?: (builder: TestContextBuilder) => TestContextBuilder;
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
 * that provide a built `ApplicationContext` and a `resolve` helper.
 *
 * @example
 * ```typescript
 * const test = createGoodieTest(definitions, { config: { DB: 'test' } });
 *
 * test('creates a user', async ({ ctx, resolve }) => {
 *   const svc = resolve(UserService);
 *   expect(svc).toBeInstanceOf(UserService);
 * });
 *
 * test.skip('wip', async ({ ctx }) => { ... });
 * ```
 */
export function createGoodieTest(
  definitions: BeanDefinition[],
  options?: GoodieTestOptions,
): TestAPI<GoodieFixtures> {
  const transactional = options?.transactional;
  const rollback = options?.rollback ?? !!transactional;

  const extended = base.extend<GoodieFixtures>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest requires destructuring pattern
    ctx: async ({}, use) => {
      let builder: TestContextBuilder = TestContext.from(definitions);

      if (options?.config) {
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

    resolve: async ({ ctx }, use) => {
      await use(
        <T>(
          token: Constructor<T> | AbstractConstructor<T> | InjectionToken<T>,
        ) => ctx.get(token),
      );
    },
  });

  if (!transactional || !rollback) return extended;

  const transactionalToken = transactional;

  // _rollback is auto:true (invisible to users), so cast to GoodieFixtures
  // biome-ignore lint/suspicious/noConfusingVoidType: vitest auto-fixture provides no value
  return extended.extend<{ _rollback: void }>({
    _rollback: [
      async ({ ctx }, use) => {
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
  });
}
