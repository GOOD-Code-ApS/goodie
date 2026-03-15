/**
 * `@ApiOperation` decorator for documenting OpenAPI operation metadata on controller methods.
 *
 * No-op at runtime — the HTTP plugin captures it at build time as
 * `DecoratorMeta { name: 'ApiOperation', args: { ... } }`.
 * `OpenApiSpecBuilder` reads the metadata to enrich the operation object.
 *
 * @example
 * ```typescript
 * @Controller('/api/todos')
 * class TodoController {
 *   @Get('/')
 *   @ApiOperation({ summary: 'List all todos', tags: ['todos'] })
 *   list(): Todo[] { ... }
 * }
 * ```
 */

import type { MethodDec } from './types.js';

export interface ApiOperationOptions {
  /** Short summary of the operation. */
  summary?: string;
  /** Detailed description of the operation. */
  description?: string;
  /** Tags for grouping operations. */
  tags?: string[];
  /** Mark the operation as deprecated. */
  deprecated?: boolean;
}

export function ApiOperation(_options: ApiOperationOptions): MethodDec {
  return (_target, _context) => {
    // No-op: metadata extracted at compile time by HTTP plugin
  };
}
