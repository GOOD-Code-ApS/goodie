import type { MethodInterceptor } from '../types.js';
import { AOP_META, type AopDecoratorEntry } from './metadata.js';

type Constructor<T = MethodInterceptor> = new (...args: any[]) => T;

export interface BeforeOptions {
  order?: number;
}

/**
 * Method decorator that runs an interceptor before the method.
 * Convenience wrapper -- the interceptor should call ctx.proceed() after its logic.
 */
export function Before(
  interceptorClass: Constructor,
  opts?: BeforeOptions,
): MethodDecorator {
  return ((_target: any, context: ClassMethodDecoratorContext) => {
    const methodName = String(context.name);
    const existing: AopDecoratorEntry[] =
      (context.metadata[AOP_META.BEFORE] as AopDecoratorEntry[]) ?? [];
    existing.push({
      methodName,
      interceptorClass,
      type: 'before',
      order: opts?.order,
    });
    context.metadata[AOP_META.BEFORE] = existing;
  }) as MethodDecorator;
}
