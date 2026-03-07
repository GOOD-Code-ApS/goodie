import { InjectionToken } from '@goodie-ts/core';
import type { Principal } from './principal.js';

/**
 * Pluggable authentication provider. Implement this as a `@Singleton` bean
 * to enable authentication for `@Secured` routes.
 *
 * The generated security middleware calls `authenticate()` for every request
 * that hits a secured route. Return a `Principal` if credentials are valid,
 * or `null` to reject.
 *
 * @example
 * ```typescript
 * @Singleton()
 * class JwtSecurityProvider implements SecurityProvider {
 *   async authenticate(request: SecurityRequest): Promise<Principal | null> {
 *     const token = request.headers.get('authorization')?.replace('Bearer ', '');
 *     if (!token) return null;
 *     return verifyJwt(token);
 *   }
 * }
 * ```
 */
export interface SecurityProvider<P extends Principal = Principal> {
  /**
   * Attempt to authenticate the incoming request.
   * @returns The authenticated principal, or `null` if authentication fails.
   */
  authenticate(request: SecurityRequest): Promise<P | null>;
}

/**
 * Minimal request abstraction for authentication.
 * The generated Hono middleware adapts Hono's `Context` to this interface.
 */
export interface SecurityRequest {
  /** Request headers. */
  headers: { get(name: string): string | undefined };
  /** Request URL. */
  url: string;
  /** HTTP method. */
  method: string;
}

/** Injection token for discovering the SecurityProvider bean. */
export const SECURITY_PROVIDER = new InjectionToken<SecurityProvider>(
  'SecurityProvider',
);
