import { HONO_META, type RouteMetadata } from './metadata.js';

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

function createRouteDecorator(method: RouteMetadata['method']) {
  return (path = '/'): MethodDecorator_Stage3 =>
    (_target, context) => {
      const methodName = String(context.name);
      const existing: RouteMetadata[] =
        (context.metadata[HONO_META.ROUTES] as RouteMetadata[]) ?? [];
      existing.push({ method, path, methodName });
      context.metadata[HONO_META.ROUTES] = existing;
    };
}

export const Get = createRouteDecorator('get');
export const Post = createRouteDecorator('post');
export const Put = createRouteDecorator('put');
export const Delete = createRouteDecorator('delete');
export const Patch = createRouteDecorator('patch');
