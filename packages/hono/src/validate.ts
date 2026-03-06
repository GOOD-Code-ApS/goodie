type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Validate request data using Zod schemas.
 *
 * This is a compile-time-only marker decorator. At build time, the transformer
 * detects `@Validate` via AST scanning and emits `zValidator()` middleware from
 * `@hono/zod-validator` before the route handler. The decorator itself is a
 * no-op at runtime — all wiring happens in generated code.
 *
 * @param _targets - Map of validation targets (`json`, `query`, `param`)
 *                   to Zod schema variables (read at build time via AST, not at runtime).
 *
 * @example
 * ```typescript
 * import { z } from 'zod'
 *
 * const createTodoSchema = z.object({ title: z.string() })
 *
 * @Controller('/todos')
 * class TodoController {
 *   @Post('/')
 *   @Validate({ json: createTodoSchema })
 *   create(c: Context) { ... }
 * }
 * ```
 */
export function Validate(
  _targets: Partial<Record<'json' | 'query' | 'param', unknown>>,
): MethodDecorator_Stage3 {
  // No-op at runtime — the transformer reads the decorator arguments via AST
  // and generates zValidator() middleware in the codegen output.
  return () => {};
}
