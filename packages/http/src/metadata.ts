/** Metadata keys for HTTP controller decorators. */
export const HTTP_META = {
  CONTROLLER: Symbol('goodie:http:controller'),
  ROUTES: Symbol('goodie:http:routes'),
  VALIDATION: Symbol('goodie:http:validation'),
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
