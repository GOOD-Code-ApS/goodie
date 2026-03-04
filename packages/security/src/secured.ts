import { SECURITY_META } from './metadata.js';

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Marks a controller class or individual route method as requiring authentication.
 *
 * When applied to a class, all routes in the controller require authentication
 * unless explicitly marked with @Anonymous().
 *
 * When applied to a method, only that route requires authentication.
 */
export function Secured(): ClassDecorator_Stage3 & MethodDecorator_Stage3 {
  return (
    _target: any,
    context: ClassDecoratorContext | ClassMethodDecoratorContext,
  ) => {
    context.metadata[SECURITY_META.SECURED] = true;
  };
}
