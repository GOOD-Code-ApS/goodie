/** Per-request store: bean cache + optional platform env bindings. */
interface RequestStore {
  beans: Map<unknown, unknown>;
  env?: Record<string, unknown>;
}

/**
 * Lazy-loaded AsyncLocalStorage instance.
 * Deferred so that importing this module doesn't fail on runtimes without
 * `node:async_hooks` (e.g. Cloudflare Workers without `nodejs_compat`).
 * The import only happens when a request scope is actually used.
 */
let storage:
  | import('node:async_hooks').AsyncLocalStorage<RequestStore>
  | undefined;

async function getStorage() {
  if (!storage) {
    try {
      const { AsyncLocalStorage } = await import('node:async_hooks');
      storage = new AsyncLocalStorage<RequestStore>();
    } catch {
      throw new Error(
        'RequestScopeManager requires AsyncLocalStorage from node:async_hooks. ' +
          'On Cloudflare Workers, enable the nodejs_compat compatibility flag.',
      );
    }
  }
  return storage;
}

function getStorageSync() {
  if (!storage) {
    throw new Error(
      'RequestScopeManager: not initialized. ' +
        'Call RequestScopeManager.run() first (which performs async initialization).',
    );
  }
  return storage;
}

/**
 * Manages request-scoped bean instances via AsyncLocalStorage.
 *
 * Each request scope maintains its own bean cache. Request-scoped beans
 * are created once per scope and cached for the duration of that scope.
 *
 * Platform bindings (e.g. Cloudflare Workers `env`) can be passed via
 * `run(fn, env)` and retrieved via `getEnv()`.
 *
 * The `node:async_hooks` import is lazy — it only happens on the first
 * `run()` call. On Cloudflare Workers, the `nodejs_compat` compatibility
 * flag must be enabled.
 */
export const RequestScopeManager = {
  /**
   * Execute a function within a new request scope.
   * All request-scoped beans resolved during `fn` will be cached
   * in this scope's store.
   */
  async run<R>(
    fn: () => R | Promise<R>,
    env?: Record<string, unknown>,
  ): Promise<R> {
    const als = await getStorage();
    return als.run({ beans: new Map(), env }, fn);
  },

  /**
   * Check if code is running inside a request scope.
   */
  isActive(): boolean {
    return storage?.getStore() !== undefined;
  },

  /**
   * Get the bean cache for the current request scope.
   * Returns undefined if not inside a scope.
   */
  getStore(): Map<unknown, unknown> | undefined {
    return storage?.getStore()?.beans;
  },

  /**
   * Get the platform env bindings for the current request scope.
   * Returns undefined if not inside a scope or no env was provided.
   */
  getEnv<T = Record<string, unknown>>(): T | undefined {
    return storage?.getStore()?.env as T | undefined;
  },

  /**
   * Retrieve a named binding from the current request scope's env.
   * Throws if not inside a scope or the binding doesn't exist.
   */
  getBinding<T>(key: string): T {
    const store = getStorageSync().getStore();
    if (!store?.env) {
      throw new Error(
        `RequestScopeManager: no request scope active. ` +
          `Ensure the request is running inside RequestScopeManager.run(). ` +
          `Requested binding: '${key}'`,
      );
    }
    const value = store.env[key];
    if (value === undefined) {
      throw new Error(
        `RequestScopeManager: binding '${key}' not found in request env. ` +
          `Available bindings: ${Object.keys(store.env).join(', ') || '(none)'}`,
      );
    }
    return value as T;
  },
} as const;
