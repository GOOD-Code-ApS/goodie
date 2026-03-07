/**
 * Overrides the auto-generated OpenAPI tag for a controller.
 *
 * By default, the tag is derived from the controller class name
 * (e.g. `TodoController` → `TodoController`). Use `@ApiTag` to customize it.
 *
 * Compile-time no-op — scanned by the openapi-hono transformer plugin.
 *
 * @example
 * ```typescript
 * @ApiTag('Todos')
 * @Controller('/api/todos')
 * class TodoController { ... }
 * ```
 */
export function ApiTag(
  _name: string,
): (target: unknown, context: ClassDecoratorContext) => void {
  return () => {};
}
