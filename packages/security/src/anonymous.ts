import { SECURITY_META } from './metadata.js';

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Exempts a route method from class-level @Secured() authentication.
 *
 * Only meaningful on methods of a @Secured() controller class.
 * Allows unauthenticated access to specific routes while the rest
 * of the controller requires authentication.
 *
 * @example
 * ```ts
 * @Secured()
 * @Controller('/api')
 * export class ApiController {
 *   @Anonymous()
 *   @Get('/health')
 *   health() { return { status: 'ok' } }
 *
 *   @Get('/data')
 *   getData(c: Context) { ... } // requires auth
 * }
 * ```
 */
export function Anonymous(): MethodDecorator_Stage3 {
  return (_target, context) => {
    context.metadata[SECURITY_META.ANONYMOUS] = true;
  };
}
