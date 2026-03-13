import { InjectionToken } from '@goodie-ts/core';
import type { HttpContext } from '@goodie-ts/http';
import type { Principal } from './principal.js';

/**
 * Abstract security provider. Users implement this to integrate their
 * authentication mechanism (JWT, session, API key, etc.).
 *
 * Multiple providers can be registered — the security middleware
 * tries each in order and uses the first successful result.
 */
export abstract class SecurityProvider {
  /**
   * Attempt to authenticate a request.
   * Returns the authenticated principal, or undefined if this
   * provider cannot authenticate the request.
   */
  abstract authenticate(
    request: HttpContext,
  ): Promise<Principal | undefined> | Principal | undefined;
}

/**
 * InjectionToken for SecurityProvider — used for collection injection
 * to discover all registered providers at runtime.
 */
export const SECURITY_PROVIDER = new InjectionToken<SecurityProvider>(
  'SecurityProvider',
);
