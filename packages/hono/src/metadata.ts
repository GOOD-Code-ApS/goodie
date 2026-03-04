/** Metadata keys for Hono controller decorators. */
export const HONO_META = {
  CONTROLLER: Symbol('goodie:hono:controller'),
  ROUTES: Symbol('goodie:hono:routes'),
  VALIDATION: Symbol('goodie:hono:validation'),
} as const;

export interface ControllerMetadata {
  basePath: string;
}

export interface RouteMetadata {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  methodName: string;
}

export type ValidationTarget = 'json' | 'query' | 'param';

export interface ValidateMetadata {
  /** Mapping from validation target to Zod schema reference. */
  targets: Partial<Record<ValidationTarget, unknown>>;
}
