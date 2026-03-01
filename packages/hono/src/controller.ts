import { type ControllerMetadata, HONO_META } from './metadata.js';

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;

/**
 * Marks a class as a Hono controller. Controllers are singletons.
 * The basePath is used as the route prefix for all methods.
 */
export function Controller(basePath = '/'): ClassDecorator_Stage3 {
  return (_target, context) => {
    const meta: ControllerMetadata = { basePath };
    context.metadata[HONO_META.CONTROLLER] = meta;
  };
}
