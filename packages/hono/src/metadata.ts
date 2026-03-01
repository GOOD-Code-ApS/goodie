/** Metadata keys for Hono controller decorators. */
export const HONO_META = {
  CONTROLLER: Symbol('goodie:hono:controller'),
  ROUTES: Symbol('goodie:hono:routes'),
} as const;

export interface ControllerMetadata {
  basePath: string;
}

export interface RouteMetadata {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  methodName: string;
}
