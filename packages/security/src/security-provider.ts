import type { Principal } from './principal.js';

/**
 * Abstract base class for authentication providers.
 *
 * Implement this class and register it as a @Singleton bean to provide
 * authentication for @Secured routes. The transformer detects
 * `extends SecurityProvider` at build time and wires the provider
 * into the generated middleware chain.
 *
 * @example
 * ```ts
 * @Singleton()
 * export class JwtAuth extends SecurityProvider {
 *   async authenticate(request: Request): Promise<Principal | null> {
 *     const token = request.headers.get('Authorization')?.replace('Bearer ', '');
 *     if (!token) return null;
 *     return verifyJwt(token);
 *   }
 * }
 * ```
 */
export abstract class SecurityProvider<P extends Principal = Principal> {
  /**
   * Authenticate an incoming request.
   * Return a Principal if authenticated, or null to reject with 401.
   */
  abstract authenticate(request: Request): Promise<P | null>;
}
