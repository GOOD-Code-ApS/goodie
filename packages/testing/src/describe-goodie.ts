import type {
  ApplicationContext,
  BeanDefinition,
  Constructor,
  InjectionToken,
} from '@goodie-ts/core';
import { TestContext, type TestContextBuilder } from './test-context.js';

/**
 * Configuration options for `describeGoodie()`.
 */
export interface GoodieTestOptions {
  /** Static config overrides, or a lazy function (useful for TestContainers URIs). */
  config?: Record<string, unknown> | (() => Record<string, unknown>);
  /** Escape hatch to customise the builder (e.g. `.override()`, `.mock()`). */
  setup?: (builder: TestContextBuilder) => TestContextBuilder;
  /** Wrap each `test.it()` in a transaction. Requires `@goodie-ts/kysely`. */
  transactional?: boolean;
  /** Whether to rollback after each test. Defaults to `true` when `transactional` is `true`. */
  rollback?: boolean;
  /** Timeout (ms) for the `beforeAll` that builds the context. Default `30_000`. */
  timeout?: number;
}

/**
 * Handle passed to the `describeGoodie` callback for registering tests and hooks.
 */
export interface GoodieTest {
  /** Lazy-proxy bean resolution — call at describe-time, actual resolution deferred to first use. */
  resolve<T>(token: Constructor<T> | InjectionToken<T>): T;
  /** Register a test case. If `transactional` is enabled, wraps in a rolled-back transaction. */
  it: (name: string, fn: () => Promise<void> | void, timeout?: number) => void;
  /** Hook that runs after the context is built (inside vitest `beforeAll`). */
  beforeAll: (fn: () => Promise<void> | void) => void;
  /** Hook that runs before each test (inside vitest `beforeEach`). */
  beforeEach: (fn: () => Promise<void> | void) => void;
  /** Hook that runs after each test (inside vitest `afterEach`). */
  afterEach: (fn: () => Promise<void> | void) => void;
  /** The built ApplicationContext. Available after `beforeAll` completes. */
  ctx: ApplicationContext;
}

/** Sentinel error used to force Kysely transaction rollback. */
class RollbackSignal extends Error {
  constructor() {
    super('RollbackSignal');
    this.name = 'RollbackSignal';
  }
}

type DescribeCallback = (test: GoodieTest) => void;

// Overload signatures
export function describeGoodie(
  name: string,
  definitions: BeanDefinition[],
  callback: DescribeCallback,
): void;
export function describeGoodie(
  name: string,
  definitions: BeanDefinition[],
  options: GoodieTestOptions,
  callback: DescribeCallback,
): void;

export function describeGoodie(
  name: string,
  definitions: BeanDefinition[],
  optionsOrCallback: GoodieTestOptions | DescribeCallback,
  maybeCallback?: DescribeCallback,
): void {
  const options: GoodieTestOptions =
    typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
  const callback: DescribeCallback =
    typeof optionsOrCallback === 'function'
      ? optionsOrCallback
      : maybeCallback!;

  const { describe, beforeAll, beforeEach, afterAll, afterEach, it } =
    importVitest();

  const timeout = options.timeout ?? 30_000;
  const transactional = options.transactional ?? false;
  const rollback = options.rollback ?? transactional;

  // Mutable state shared between hooks and tests
  let ctx: ApplicationContext | undefined;
  let transactionManager: TransactionManagerLike | undefined;

  // User-registered hooks (collected at describe-time, executed in beforeAll/beforeEach/afterEach)
  const userBeforeAllFns: Array<() => Promise<void> | void> = [];
  const userBeforeEachFns: Array<() => Promise<void> | void> = [];
  const userAfterEachFns: Array<() => Promise<void> | void> = [];

  function resolve<T>(token: Constructor<T> | InjectionToken<T>): T {
    let cached: T | undefined;
    return new Proxy({} as object, {
      get(_, prop) {
        if (!cached) {
          if (!ctx) {
            throw new Error(
              'describeGoodie: context not built yet — resolve() proxies can only be accessed inside test bodies or afterAll hooks',
            );
          }
          cached = ctx.get(token);
        }
        const value = (cached as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function' ? value.bind(cached) : value;
      },
    }) as T;
  }

  const goodieTest: GoodieTest = {
    resolve,
    get ctx(): ApplicationContext {
      if (!ctx) {
        throw new Error(
          'describeGoodie: context not built yet — ctx is available after beforeAll',
        );
      }
      return ctx;
    },
    it(testName, fn, testTimeout?) {
      if (transactional && rollback) {
        it(
          testName,
          async () => {
            if (!transactionManager) {
              throw new Error(
                'describeGoodie: transactional mode requires @goodie-ts/kysely TransactionManager in the context',
              );
            }
            let testError: unknown;
            try {
              await transactionManager.runInTransaction(async () => {
                try {
                  await fn();
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
          testTimeout,
        );
      } else {
        it(testName, fn, testTimeout);
      }
    },
    beforeAll(fn) {
      userBeforeAllFns.push(fn);
    },
    beforeEach(fn) {
      userBeforeEachFns.push(fn);
    },
    afterEach(fn) {
      userAfterEachFns.push(fn);
    },
  };

  describe(name, () => {
    beforeAll(async () => {
      let builder: TestContextBuilder = TestContext.from(definitions);

      // Apply config
      if (options.config) {
        const configValue =
          typeof options.config === 'function'
            ? options.config()
            : options.config;
        builder = builder.withConfig(configValue);
      }

      // Apply user setup
      if (options.setup) {
        builder = options.setup(builder);
      }

      ctx = await builder.build();

      // Discover TransactionManager if transactional mode
      if (transactional) {
        transactionManager = await discoverTransactionManager(ctx);
      }

      // Run user beforeAll hooks
      for (const fn of userBeforeAllFns) {
        await fn();
      }
    }, timeout);

    beforeEach(async () => {
      for (const fn of userBeforeEachFns) {
        await fn();
      }
    });

    afterEach(async () => {
      for (const fn of userAfterEachFns) {
        await fn();
      }
    });

    afterAll(async () => {
      await ctx?.close();
    });

    // Execute the callback synchronously to register test.it() / test.beforeAll() etc.
    callback(goodieTest);
  });
}

/** Minimal interface for TransactionManager — avoids compile-time dep on @goodie-ts/kysely. */
interface TransactionManagerLike {
  runInTransaction<T>(fn: () => Promise<T>, requiresNew?: boolean): Promise<T>;
}

async function discoverTransactionManager(
  ctx: ApplicationContext,
): Promise<TransactionManagerLike> {
  try {
    // Dynamic import — @goodie-ts/kysely is an optional peer dependency.
    // Use a variable to prevent TypeScript from statically resolving the module.
    const moduleName = '@goodie-ts/kysely';
    const kyselyModule = (await import(moduleName)) as {
      TransactionManager: Constructor;
    };
    const tm = ctx.get(kyselyModule.TransactionManager);
    return tm as TransactionManagerLike;
  } catch {
    throw new Error(
      'describeGoodie: transactional mode requires @goodie-ts/kysely to be installed and TransactionManager registered in the context',
    );
  }
}

/** Vitest globals available when `globals: true` or auto-injected by vitest runner. */
interface VitestGlobals {
  describe: (name: string, fn: () => void) => void;
  beforeAll: (fn: () => Promise<void> | void, timeout?: number) => void;
  beforeEach: (fn: () => Promise<void> | void) => void;
  afterAll: (fn: () => Promise<void> | void) => void;
  afterEach: (fn: () => Promise<void> | void) => void;
  it: (name: string, fn: () => Promise<void> | void, timeout?: number) => void;
}

/** Import vitest at call-time — keeps vitest as a peer dep, not a hard dep. */
function importVitest(): VitestGlobals {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.describe !== 'function') {
    throw new Error(
      'describeGoodie requires vitest — ensure tests are run with vitest',
    );
  }
  return {
    describe: g.describe as VitestGlobals['describe'],
    beforeAll: g.beforeAll as VitestGlobals['beforeAll'],
    beforeEach: g.beforeEach as VitestGlobals['beforeEach'],
    afterAll: g.afterAll as VitestGlobals['afterAll'],
    afterEach: g.afterEach as VitestGlobals['afterEach'],
    it: g.it as VitestGlobals['it'],
  };
}
