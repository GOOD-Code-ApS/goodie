export const AOP_META = {
  AROUND: Symbol('goodie:aop:around'),
  BEFORE: Symbol('goodie:aop:before'),
  AFTER: Symbol('goodie:aop:after'),
} as const;

export interface AopDecoratorEntry {
  methodName: string;
  interceptorClass: new (...args: any[]) => unknown;
  type: 'around' | 'before' | 'after';
  order?: number;
}
