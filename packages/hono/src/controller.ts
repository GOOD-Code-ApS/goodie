type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;

/**
 * Marks a class as an HTTP controller. Controllers are singletons.
 * The basePath is used as the route prefix for all methods.
 *
 * This is a compile-time marker (no-op at runtime). The hono transformer
 * plugin extracts the basePath via AST scanning.
 */
export function Controller(_basePath = '/'): ClassDecorator_Stage3 {
  return () => {};
}
