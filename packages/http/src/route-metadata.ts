import type { DecoratorMeta } from '@goodie-ts/core';

/** HTTP method for a route. */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

/** How a controller method parameter is bound to the HTTP request. */
export type ParamBinding = 'path' | 'query' | 'body' | 'context';

/** Metadata for a single parameter on a route method. */
export interface ParamMetadata {
  /** Parameter name as declared in the method signature. */
  name: string;
  /** How this parameter is bound to the request. */
  binding: ParamBinding;
  /** TypeScript type text (e.g. 'string', 'number', 'CreateTodoDto'). */
  typeName: string;
  /** Whether the parameter is optional (has `?` or default value). */
  optional: boolean;
  /** Import path for class-typed body params (used by adapter plugins to import the type). */
  typeImportPath?: string;
}

/** Metadata for a single route method on a controller. */
export interface RouteMetadata {
  methodName: string;
  httpMethod: HttpMethod;
  path: string;
  /** Default response status code (from @Status decorator, defaults to 200). */
  status: number;
  /** Detailed parameter binding metadata for implicit param resolution. */
  params: ParamMetadata[];
  /** Return type text with Promise<T> and Response<T> unwrapped (e.g. 'Todo', 'Todo | null', 'void'). */
  returnType: string;
  /** All non-route decorators on this method (e.g. @ApiResponse, @ApiOperation). Empty if none. */
  decorators?: DecoratorMeta[];
}

/** Controller metadata stored on component metadata by the http plugin. */
export interface ControllerMetadata {
  basePath: string;
  routes: RouteMetadata[];
}
