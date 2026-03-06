export type { ControllerMetadata, RouteMetadata } from '@goodie-ts/http';
export { HTTP_META, HTTP_META as HONO_META } from '@goodie-ts/http';

export type ValidationTarget = 'json' | 'query' | 'param';

export interface ValidateMetadata {
  /** Mapping from validation target to Zod schema reference. */
  targets: Partial<Record<ValidationTarget, unknown>>;
}
