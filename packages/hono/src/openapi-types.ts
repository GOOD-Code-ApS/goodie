/**
 * Options for describing an OpenAPI route. Passed as the second argument
 * to route decorators (`@Get`, `@Post`, etc.).
 *
 * These mirror the `describeRoute()` options from `hono-openapi`.
 * At runtime this is a no-op — the transformer plugin reads the AST.
 */
export interface DescribeRouteOptions {
  summary?: string;
  description?: string;
  deprecated?: boolean;
  tags?: string[];
  responses?: Record<
    number,
    {
      description: string;
      content?: Record<string, { schema: unknown }>;
    }
  >;
}
