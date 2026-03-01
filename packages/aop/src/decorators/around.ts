import type { MethodInterceptor } from '../types.js';
import { AOP_META, type AopDecoratorEntry } from './metadata.js';

type Constructor<T = MethodInterceptor> = new (...args: any[]) => T;

export interface AroundOptions {
  order?: number;
}

/**
 * Method decorator that applies an interceptor around the method.
 * The interceptor's `intercept()` wraps the full method execution.
 */
export function Around(
  interceptorClass: Constructor,
  opts?: AroundOptions,
): MethodDecorator {
  return ((_target: any, context: ClassMethodDecoratorContext) => {
    const methodName = String(context.name);
    const existing: AopDecoratorEntry[] =
      (context.metadata[AOP_META.AROUND] as AopDecoratorEntry[]) ?? [];
    existing.push({
      methodName,
      interceptorClass,
      type: 'around',
      order: opts?.order,
    });
    context.metadata[AOP_META.AROUND] = existing;
  }) as MethodDecorator;
}
