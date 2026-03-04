import { SECURITY_META } from './metadata.js';

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Restricts a route method to principals that have at least one of the specified roles.
 * Implies @Secured() — the route must be authenticated first.
 *
 * @example
 * ```ts
 * @Roles('admin', 'manager')
 * @Get('/admin')
 * adminPanel(c: Context) { ... }
 * ```
 */
export function Roles(...roles: string[]): MethodDecorator_Stage3 {
  return (_target, context) => {
    context.metadata[SECURITY_META.ROLES] = roles;
  };
}
