/**
 * Document an operation on a controller method.
 *
 * Compile-time no-op — the openapi transformer plugin reads the decorator
 * arguments from the AST to generate the OpenAPI spec.
 *
 * @example
 * ```typescript
 * @Get('/')
 * @ApiOperation({ summary: 'List all todos', description: 'Returns all todos ordered by creation date' })
 * async getAll(c: Context) { ... }
 * ```
 */
export function ApiOperation(
  _options: ApiOperationOptions,
): (target: any, context: any) => void {
  return () => {};
}

export interface ApiOperationOptions {
  summary?: string;
  description?: string;
  deprecated?: boolean;
}
