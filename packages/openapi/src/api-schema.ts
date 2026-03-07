/**
 * Wrap a schema variable with its OpenAPI definition.
 *
 * At runtime this is a pass-through — it returns `schema` unchanged.
 * At compile time the openapi transformer plugin extracts the `spec`
 * argument from the AST and uses it as the schema definition in
 * `components.schemas`.
 *
 * @param schema - The actual schema (e.g. a Zod schema) — returned as-is
 * @param spec - OpenAPI schema definition object
 * @returns The original schema, unchanged
 *
 * @example
 * ```typescript
 * import { ApiSchema } from '@goodie-ts/openapi';
 * import { z } from 'zod';
 *
 * export const todoSchema = ApiSchema(z.object({
 *   id: z.string().uuid(),
 *   title: z.string(),
 *   completed: z.boolean(),
 * }), {
 *   type: 'object',
 *   properties: {
 *     id: { type: 'string', format: 'uuid' },
 *     title: { type: 'string' },
 *     completed: { type: 'boolean' },
 *   },
 *   required: ['id', 'title', 'completed'],
 * });
 * ```
 */
export function ApiSchema<T>(schema: T, _spec: OpenApiSchemaSpec): T {
  return schema;
}

export interface OpenApiSchemaSpec {
  type: string;
  properties?: Record<string, OpenApiPropertySpec>;
  required?: string[];
  items?: OpenApiPropertySpec;
  description?: string;
}

export interface OpenApiPropertySpec {
  type: string;
  format?: string;
  description?: string;
  properties?: Record<string, OpenApiPropertySpec>;
  required?: string[];
  items?: OpenApiPropertySpec;
  enum?: (string | number)[];
}
