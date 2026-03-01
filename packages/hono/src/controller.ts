import { type ControllerMetadata, HONO_META } from './metadata.js';

/**
 * Marks a class as a Hono controller. Controllers are singletons.
 * The basePath is used as the route prefix for all methods.
 */
export function Controller(basePath = '/'): ClassDecorator {
  return ((_target: any, context: ClassDecoratorContext) => {
    const meta: ControllerMetadata = { basePath };
    context.metadata[HONO_META.CONTROLLER] = meta;
  }) as ClassDecorator;
}
