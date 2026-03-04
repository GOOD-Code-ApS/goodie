/** Metadata keys for security decorators. */
export const SECURITY_META = {
  SECURED: Symbol('goodie:security:secured'),
  ROLES: Symbol('goodie:security:roles'),
  ANONYMOUS: Symbol('goodie:security:anonymous'),
} as const;
