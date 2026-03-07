/** Metadata keys for HTTP controller decorators. */
export const HTTP_META = {
  CONTROLLER: Symbol('goodie:http:controller'),
  ROUTES: Symbol('goodie:http:routes'),
} as const;

export interface ControllerMetadata {
  basePath: string;
}

export interface RouteMetadata {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  methodName: string;
}
