/** Represents an authenticated user/identity. */
export interface Principal {
  /** Primary identifier for the authenticated subject (maps to JWT `sub`, username, API key ID, etc.). */
  name: string;
  /** Arbitrary attributes associated with this principal (claims, roles, permissions, etc.). */
  attributes: Record<string, unknown>;
}
