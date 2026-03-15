type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Sets the default HTTP response status code for a controller method.
 *
 * When the method returns a plain value (not a `Response<T>`), the adapter
 * uses this status code instead of the default 200. If the method returns
 * a `Response<T>`, the Response's status takes precedence at runtime.
 *
 * Only one `@Status` decorator is allowed per method — enforced at
 * compile time by the HTTP transformer plugin.
 *
 * This is a compile-time marker (no-op at runtime). The http transformer
 * plugin extracts the status code via AST scanning.
 */
export function Status(_code: number): MethodDecorator_Stage3 {
  return () => {};
}
