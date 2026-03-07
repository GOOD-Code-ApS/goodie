/**
 * Override the auto-generated OpenAPI tag for a controller.
 *
 * By default, the controller class name is used as the tag. This decorator
 * lets you provide a more user-friendly name.
 *
 * Compile-time no-op — the openapi transformer plugin reads the decorator
 * argument from the AST to generate the OpenAPI spec.
 *
 * @param name - Tag name to use instead of the class name
 *
 * @example
 * ```typescript
 * @Controller('/api/todos')
 * @ApiTag('Todos')
 * class TodoController { ... }
 * ```
 */
export function ApiTag(_name: string): (target: any, context: any) => void {
  return () => {};
}
