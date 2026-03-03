import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<Map<string, string>>();

/**
 * Mapped Diagnostic Context — request-scoped key-value store backed by AsyncLocalStorage.
 *
 * Use `MDC.run()` to create a context (typically in middleware), then
 * `MDC.get()`/`MDC.put()` to read/write values anywhere in the async call chain.
 */
export const MDC = {
  /**
   * Run a function within an MDC context.
   * All async operations within `fn` will have access to the context.
   */
  run<T>(context: Map<string, string>, fn: () => T): T {
    return storage.run(context, fn);
  },

  /** Get a value from the current MDC context. */
  get(key: string): string | undefined {
    return storage.getStore()?.get(key);
  },

  /** Set a value in the current MDC context. */
  put(key: string, value: string): void {
    storage.getStore()?.set(key, value);
  },

  /** Get all entries from the current MDC context. */
  getAll(): Record<string, string> {
    const store = storage.getStore();
    if (!store) return {};
    return Object.fromEntries(store);
  },

  /** Remove a value from the current MDC context. */
  remove(key: string): void {
    storage.getStore()?.delete(key);
  },

  /** Clear all values from the current MDC context. */
  clear(): void {
    storage.getStore()?.clear();
  },
} as const;
