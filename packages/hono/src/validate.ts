import { HONO_META, type ValidateMetadata } from './metadata.js';

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Validate request data using Zod schemas.
 *
 * At build time, the transformer detects this decorator and emits
 * `zValidator()` middleware from `@hono/zod-validator` before the
 * route handler.
 *
 * @param targets - Map of validation targets (`json`, `query`, `param`)
 *                  to Zod schema variables.
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
  targets: Partial<Record<'json' | 'query' | 'param', unknown>>,
): MethodDecorator_Stage3 {
  return (_target, context) => {
    const meta: ValidateMetadata = { targets };
    context.metadata[HONO_META.VALIDATION] = {
      ...meta,
      methodName: String(context.name),
    };
  };
}
