type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Create a route decorator factory. All route decorators are compile-time
 * markers (no-ops at runtime). The hono transformer plugin extracts the
 * HTTP method and path via AST scanning.
 */
function createRouteDecorator() {
  return (_path = '/'): MethodDecorator_Stage3 =>
    () => {};
}

export const Get = createRouteDecorator();
export const Post = createRouteDecorator();
export const Put = createRouteDecorator();
export const Delete = createRouteDecorator();
export const Patch = createRouteDecorator();
