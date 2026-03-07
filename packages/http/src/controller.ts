import { type ControllerMetadata, HTTP_META } from './metadata.js';

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;

/**
 * Marks a class as an HTTP controller. Controllers are singletons.
 * The basePath is used as the route prefix for all methods.
 */
export function Controller(basePath = '/'): ClassDecorator_Stage3 {
  return (_target, context) => {
    const meta: ControllerMetadata = { basePath };
    context.metadata[HTTP_META.CONTROLLER] = meta;
  };
}
