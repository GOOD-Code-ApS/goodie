/**
 * Represents an authenticated identity.
 *
 * Adapters set this on the SecurityContext after successful authentication.
 * Application code reads it via `SecurityContext.current()`.
 */
export interface Principal {
  /** The identity name (e.g. username, email, subject ID). */
  name: string;
  /** Roles granted to this principal (e.g. 'ADMIN', 'USER'). */
  roles: string[];
  /** Arbitrary attributes (claims, metadata). */
  attributes: Record<string, unknown>;
}
