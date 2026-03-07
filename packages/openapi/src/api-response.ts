/**
 * Document an HTTP response on a controller method.
 *
 * Compile-time no-op — the openapi transformer plugin reads the decorator
 * arguments from the AST to generate the OpenAPI spec.
 *
 * @param status - HTTP status code (e.g. 200, 400, 404)
 * @param description - Human-readable description of the response
 * @param options - Optional response options (e.g. schema reference)
 *
 * @example
 * ```typescript
 * @Post('/')
 * @ApiResponse(201, 'Todo created', { schema: todoSchema })
 * @ApiResponse(400, 'Validation failed', { schema: errorSchema })
 * @ApiResponse(401, 'Authentication required')
 * async create(c: Context) { ... }
 * ```
 */
export function ApiResponse(
  _status: number,
  _description: string,
  _options?: ApiResponseOptions,
): (target: any, context: any) => void {
  return () => {};
}

export interface ApiResponseOptions {
  /** A schema variable reference. The variable name becomes a $ref in the OpenAPI spec. */
  schema?: unknown;
}
