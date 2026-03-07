/**
 * Adds an explicit OpenAPI response definition to a route method.
 *
 * Compile-time no-op — scanned by the openapi-hono transformer plugin.
 * Multiple `@ApiResponse` can be stacked on a single method.
 *
 * @example
 * ```typescript
 * @ApiResponse(201, 'Todo created')
 * @ApiResponse(409, 'Todo already exists')
 * @Post('/')
 * create() { ... }
 * ```
 */
export function ApiResponse(
  _status: number,
  _description: string,
): (target: unknown, context: ClassMethodDecoratorContext) => void {
  return () => {};
}
