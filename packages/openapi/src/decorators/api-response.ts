/**
 * `@ApiResponse` decorator for documenting HTTP response codes on controller methods.
 *
 * No-op at runtime — the HTTP plugin captures it at build time as
 * `DecoratorMeta { name: 'ApiResponse', args: { value: status, value2: { ... } } }`.
 * `OpenApiSpecBuilder` reads the metadata to generate response entries.
 *
 * Can be applied multiple times to document multiple response codes.
 *
 * @example
 * ```typescript
 * @Controller('/api/todos')
 * class TodoController {
 *   @Get('/:id')
 *   @ApiResponse(200, { description: 'The todo item' })
 *   @ApiResponse(404, { description: 'Todo not found' })
 *   getById(id: string): Todo | null { ... }
 * }
 * ```
 */

import type { MethodDec } from './types.js';

export interface ApiResponseOptions {
  /** Human-readable description of this response. */
  description?: string;
  /** Type name to use as the response schema (overrides return type inference). */
  type?: string;
}

export function ApiResponse(
  _status: number,
  _options?: ApiResponseOptions,
): MethodDec {
  return (_target, _context) => {
    // No-op: metadata extracted at compile time by HTTP plugin
  };
}
