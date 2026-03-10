/** HTTP method for a route. */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

/** Metadata for a single route method on a controller. */
export interface RouteMetadata {
  methodName: string;
  httpMethod: HttpMethod;
  path: string;
  /** Whether this method declares a Request<T> parameter. */
  hasRequestParam: boolean;
  /** Whether this route requires authentication. */
  secured?: boolean;
  /** Whether this route is explicitly anonymous (overrides class-level @Secured). */
  anonymous?: boolean;
}

/** Controller metadata stored on bean metadata by the http plugin. */
export interface ControllerMetadata {
  basePath: string;
  routes: RouteMetadata[];
  /** Whether the class has @Secured. */
  secured?: boolean;
}
