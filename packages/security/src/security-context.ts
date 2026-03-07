import { AsyncLocalStorage } from 'node:async_hooks';
import { Singleton } from '@goodie-ts/core';
import type { Principal } from './principal.js';

/**
 * Stores the authenticated principal for the current async context.
 *
 * The `SecurityHttpFilter` calls `run()` to set the principal for the
 * duration of an HTTP request. The `SecurityInterceptor` reads it via
 * `getPrincipal()` to enforce `@Secured`.
 *
 * Uses `AsyncLocalStorage` so the principal propagates through the entire
 * call chain (controller → service → repository) without explicit passing.
 */
@Singleton()
export class SecurityContext {
  private readonly storage = new AsyncLocalStorage<Principal | null>();

  /** Get the principal for the current async context, or `null` if none. */
  getPrincipal<P extends Principal = Principal>(): P | null {
    return (this.storage.getStore() ?? null) as P | null;
  }

  /** Run a function with the given principal in the async context. */
  run<T>(principal: Principal | null, fn: () => T): T {
    return this.storage.run(principal, fn);
  }
}
