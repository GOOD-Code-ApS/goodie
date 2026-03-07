import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped store for runtime environment bindings.
 *
 * Used to bridge per-request values (e.g. Cloudflare Workers `env` bindings)
 * into singleton beans without coupling framework packages to each other.
 *
 * - `@goodie-ts/hono` writes bindings via middleware: `RuntimeBindings.run(c.env, next)`
 * - `@goodie-ts/kysely` reads bindings in dialect factories: `RuntimeBindings.get<D1Database>('DB')`
 */

const storage = new AsyncLocalStorage<Record<string, unknown>>();

/**
 * Execute a function with the given bindings available via `get()`.
 * Typically called from generated middleware that captures platform env.
 */
function run<R>(bindings: Record<string, unknown>, fn: () => R): R {
  return storage.run(bindings, fn);
}

/**
 * Retrieve a named binding from the current request context.
 * Throws if called outside a `run()` scope.
 */
function get<T>(key: string): T {
  const store = storage.getStore();
  if (!store) {
    throw new Error(
      `RuntimeBindings: no bindings available in current context. ` +
        `Ensure the request is running inside RuntimeBindings.run(). ` +
        `Requested binding: '${key}'`,
    );
  }
  const value = store[key];
  if (value === undefined) {
    throw new Error(
      `RuntimeBindings: binding '${key}' not found. ` +
        `Available bindings: ${Object.keys(store).join(', ') || '(none)'}`,
    );
  }
  return value as T;
}

/** Check if bindings are available in the current context. */
function isAvailable(): boolean {
  return storage.getStore() !== undefined;
}

export const RuntimeBindings = { run, get, isAvailable } as const;
