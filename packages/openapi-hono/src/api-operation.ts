export interface ApiOperationOptions {
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
}

/**
 * Adds OpenAPI operation metadata to a route method.
 *
 * Compile-time no-op — scanned by the openapi-hono transformer plugin.
 *
 * @example
 * ```typescript
 * @ApiOperation({ summary: 'List all todos', tags: ['todos'] })
 * @Get('/')
 * list() { ... }
 * ```
 */
export function ApiOperation(
  _options: ApiOperationOptions,
): (target: unknown, context: ClassMethodDecoratorContext) => void {
  return () => {};
}
