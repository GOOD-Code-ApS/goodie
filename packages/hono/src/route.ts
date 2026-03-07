import type { DescribeRouteOptions } from './openapi-types.js';

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Create a route decorator factory. All route decorators are compile-time
 * markers (no-ops at runtime). The hono transformer plugin extracts the
 * HTTP method, path, and optional OpenAPI options via AST scanning.
 */
function createRouteDecorator() {
  return (
    _path = '/',
    _options?: DescribeRouteOptions,
  ): MethodDecorator_Stage3 =>
    () => {};
}

export const Get = createRouteDecorator();
export const Post = createRouteDecorator();
export const Put = createRouteDecorator();
export const Delete = createRouteDecorator();
export const Patch = createRouteDecorator();
