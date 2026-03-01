import type { MethodInterceptor } from '../types.js';
import { AOP_META, type AopDecoratorEntry } from './metadata.js';

type Constructor<T = MethodInterceptor> = new (...args: any[]) => T;

export interface AfterOptions {
  order?: number;
}

/**
 * Method decorator that runs an interceptor after the method.
 * Convenience wrapper -- the interceptor calls ctx.proceed() first, then runs its logic.
 */
export function After(
  interceptorClass: Constructor,
  opts?: AfterOptions,
): MethodDecorator {
  return ((_target: any, context: ClassMethodDecoratorContext) => {
    const methodName = String(context.name);
    const existing: AopDecoratorEntry[] =
      (context.metadata[AOP_META.AFTER] as AopDecoratorEntry[]) ?? [];
    existing.push({
      methodName,
      interceptorClass,
      type: 'after',
      order: opts?.order,
    });
    context.metadata[AOP_META.AFTER] = existing;
  }) as MethodDecorator;
}
