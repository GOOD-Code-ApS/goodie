import type { AfterAdvice } from '../types.js';
import { AOP_META, type AopDecoratorEntry } from './metadata.js';

type Constructor<T = AfterAdvice> = new (...args: any[]) => T;

export interface AfterOptions {
  order?: number;
}

/**
 * Method decorator that runs advice after the method.
 * The advice class should implement `AfterAdvice`.
 */
export function After(
  adviceClass: Constructor,
  opts?: AfterOptions,
): MethodDecorator {
  return ((_target: any, context: ClassMethodDecoratorContext) => {
    const methodName = String(context.name);
    const existing: AopDecoratorEntry[] =
      (context.metadata[AOP_META.INTERCEPTORS] as AopDecoratorEntry[]) ?? [];
    existing.push({
      methodName,
      interceptorClass: adviceClass,
      adviceType: 'after',
      order: opts?.order,
    });
    context.metadata[AOP_META.INTERCEPTORS] = existing;
  }) as MethodDecorator;
}
