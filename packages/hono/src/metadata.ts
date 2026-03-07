export type ValidationTarget = 'json' | 'query' | 'param';

export interface ValidateMetadata {
  /** Mapping from validation target to Zod schema reference. */
  targets: Partial<Record<ValidationTarget, unknown>>;
}
