/**
 * Represents an authenticated identity.
 *
 * Follows the Micronaut model — `name` identifies the principal, and
 * `attributes` carries arbitrary claims (roles, permissions, etc.).
 */
export interface Principal {
  /** Unique identifier for this principal (e.g. username, email, sub claim). */
  name: string;

  /** Arbitrary attributes associated with the principal (roles, permissions, custom claims). */
  attributes: Record<string, unknown>;
}
