import type { BeforeAdvice } from '../types.js';
import { AOP_META, type AopDecoratorEntry } from './metadata.js';

type Constructor<T = BeforeAdvice> = new (...args: any[]) => T;

export interface BeforeOptions {
  order?: number;
}

/**
 * Method decorator that runs advice before the method.
 * The advice class should implement `BeforeAdvice`.
 */
export function Before(
  adviceClass: Constructor,
  opts?: BeforeOptions,
): MethodDecorator {
  return ((_target: any, context: ClassMethodDecoratorContext) => {
    const methodName = String(context.name);
    const existing: AopDecoratorEntry[] =
      (context.metadata[AOP_META.INTERCEPTORS] as AopDecoratorEntry[]) ?? [];
    existing.push({
      methodName,
      interceptorClass: adviceClass,
      adviceType: 'before',
      order: opts?.order,
    });
    context.metadata[AOP_META.INTERCEPTORS] = existing;
  }) as MethodDecorator;
}
