import type { Principal } from './principal.js';

/**
 * Lazy-loaded AsyncLocalStorage for the security context.
 * Same pattern as RequestScopeManager in @goodie-ts/core.
 */
let storage:
  | import('node:async_hooks').AsyncLocalStorage<Principal | undefined>
  | undefined;
let storagePromise:
  | Promise<import('node:async_hooks').AsyncLocalStorage<Principal | undefined>>
  | undefined;

async function getStorage() {
  if (storage) return storage;
  if (!storagePromise) {
    storagePromise = import('node:async_hooks')
      .then(({ AsyncLocalStorage }) => {
        storage = new AsyncLocalStorage<Principal | undefined>();
        return storage;
      })
      .catch(() => {
        storagePromise = undefined;
        throw new Error(
          'SecurityContext requires AsyncLocalStorage from node:async_hooks. ' +
            'On Cloudflare Workers, enable the nodejs_compat compatibility flag.',
        );
      });
  }
  return storagePromise;
}

/**
 * Security context backed by AsyncLocalStorage.
 *
 * Stores the authenticated `Principal` for the current request.
 * Adapters call `SecurityContext.run()` in middleware after authentication.
 * Application code and interceptors read via `SecurityContext.current()`.
 */
export const SecurityContext = {
  /**
   * Execute a function with the given principal in scope.
   * Called by security middleware after authentication.
   */
  async run<R>(
    principal: Principal | undefined,
    fn: () => R | Promise<R>,
  ): Promise<R> {
    const als = await getStorage();
    return als.run(principal, fn);
  },

  /**
   * Get the authenticated principal for the current request.
   * Returns undefined if not authenticated or not inside a security context.
   */
  current(): Principal | undefined {
    return storage?.getStore();
  },

  /**
   * Check if code is running inside a security context.
   */
  isActive(): boolean {
    return storage?.getStore() !== undefined;
  },
} as const;
