import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request store: bean cache + optional platform env bindings. */
interface RequestStore {
  beans: Map<unknown, unknown>;
  env?: Record<string, unknown>;
}

const storage = new AsyncLocalStorage<RequestStore>();

/**
 * Manages request-scoped bean instances via AsyncLocalStorage.
 *
 * Each request scope maintains its own bean cache. Request-scoped beans
 * are created once per scope and cached for the duration of that scope.
 *
 * Platform bindings (e.g. Cloudflare Workers `env`) can be passed via
 * `beginScope(env)` and retrieved via `getEnv()`.
 */
export const RequestScopeManager = {
  /**
   * Execute a function within a new request scope.
   * All request-scoped beans resolved during `fn` will be cached
   * in this scope's store.
   */
  run<R>(fn: () => R, env?: Record<string, unknown>): R {
    return storage.run({ beans: new Map(), env }, fn);
  },

  /**
   * Check if code is running inside a request scope.
   */
  isActive(): boolean {
    return storage.getStore() !== undefined;
  },

  /**
   * Get the bean cache for the current request scope.
   * Returns undefined if not inside a scope.
   */
  getStore(): Map<unknown, unknown> | undefined {
    return storage.getStore()?.beans;
  },

  /**
   * Get the platform env bindings for the current request scope.
   * Returns undefined if not inside a scope or no env was provided.
   */
  getEnv<T = Record<string, unknown>>(): T | undefined {
    return storage.getStore()?.env as T | undefined;
  },

  /**
   * Retrieve a named binding from the current request scope's env.
   * Throws if not inside a scope or the binding doesn't exist.
   */
  getBinding<T>(key: string): T {
    const store = storage.getStore();
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
