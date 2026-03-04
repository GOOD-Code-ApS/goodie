/** Represents an authenticated user/identity. */
export interface Principal {
  /** Unique identifier for the authenticated subject. */
  id: string;
  /** Roles assigned to this principal (used by @Roles). */
  roles?: string[];
}
