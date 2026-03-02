import type {
  ApplicationContext,
  BeanDefinition,
  Constructor,
  InjectionToken,
} from '@goodie-ts/core';
import { test as base } from 'vitest';
import { TestContext, type TestContextBuilder } from './test-context.js';

/**
 * Configuration options for `createGoodieTest()`.
 */
export interface GoodieTestOptions {
  /** Static config overrides, or a lazy function (useful for TestContainers URIs). */
  config?: Record<string, unknown> | (() => Record<string, unknown>);
  /** Escape hatch to customise the builder (e.g. `.override()`, `.mock()`). */
  setup?: (builder: TestContextBuilder) => TestContextBuilder;
  /** Wrap each test in a transaction. Requires `@goodie-ts/kysely`. */
  transactional?: boolean;
  /** Whether to rollback after each test. Defaults to `true` when `transactional` is `true`. */
  rollback?: boolean;
}

/** Fixtures provided by `createGoodieTest()`. */
export interface GoodieFixtures {
  /** The built ApplicationContext. Built fresh per test, closed after. */
  ctx: ApplicationContext;
  /** Convenience function to resolve beans from the context. */
  resolve: <T>(token: Constructor<T> | InjectionToken<T>) => T;
}

/** Sentinel error used to force Kysely transaction rollback. */
class RollbackSignal extends Error {
  constructor() {
    super('RollbackSignal');
    this.name = 'RollbackSignal';
  }
}

/** Minimal interface for TransactionManager — avoids compile-time dep on @goodie-ts/kysely. */
interface TransactionManagerLike {
  runInTransaction<T>(fn: () => Promise<T>, requiresNew?: boolean): Promise<T>;
}

async function discoverTransactionManager(
  ctx: ApplicationContext,
): Promise<TransactionManagerLike> {
  try {
    const moduleName = '@goodie-ts/kysely';
    const kyselyModule = (await import(moduleName)) as {
      TransactionManager: Constructor;
    };
    const tm = ctx.get(kyselyModule.TransactionManager);
    return tm as TransactionManagerLike;
  } catch {
    throw new Error(
      'createGoodieTest: transactional mode requires @goodie-ts/kysely to be installed and TransactionManager registered in the context',
    );
  }
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
) {
  const transactional = options?.transactional ?? false;
  const rollback = options?.rollback ?? transactional;

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
      await use(<T>(token: Constructor<T> | InjectionToken<T>) =>
        ctx.get(token),
      );
    },
  });

  if (!transactional || !rollback) return extended;

  // biome-ignore lint/suspicious/noConfusingVoidType: vitest auto-fixture provides no value
  return extended.extend<{ _rollback: void }>({
    _rollback: [
      async ({ ctx }, use) => {
        const tm = await discoverTransactionManager(ctx);
        let testError: unknown;
        try {
          await tm.runInTransaction(async () => {
            try {
              await use();
            } catch (e) {
              testError = e;
            }
            throw new RollbackSignal();
          }, true);
        } catch (e) {
          if (!(e instanceof RollbackSignal)) {
            throw e;
          }
        }
        if (testError) {
          throw testError;
        }
      },
      { auto: true },
    ],
  });
}
