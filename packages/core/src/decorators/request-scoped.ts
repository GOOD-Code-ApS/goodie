/**
 * Marks a class as request-scoped. A new instance is created per request
 * and cached within that request's scope.
 *
 * Request-scoped beans are resolved from the current request context
 * managed by `RequestScopeManager`. When a singleton depends on a
 * request-scoped bean, the transformer generates a proxy that resolves
 * to the current request's instance on each property access.
 *
 * This decorator is a compile-time no-op -- the transformer scans it
 * via AST and sets `scope: 'request'` on the bean definition.
 */
export function RequestScoped(): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
