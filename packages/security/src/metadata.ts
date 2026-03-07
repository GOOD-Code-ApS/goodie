/** Metadata keys for security decorators. */
export const SECURITY_META = {
  /** Set to `true` on classes decorated with `@Secured()`. */
  SECURED: Symbol('goodie:security:secured'),
  /** `Set<string>` of method names decorated with `@Secured()`. */
  SECURED_METHODS: Symbol('goodie:security:secured-methods'),
  /** `Set<string>` of method names decorated with `@Anonymous()`. */
  ANONYMOUS_METHODS: Symbol('goodie:security:anonymous-methods'),
} as const;
