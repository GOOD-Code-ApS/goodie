export const AOP_META = {
  INTERCEPTORS: Symbol('goodie:aop:interceptors'),
} as const;

export interface AopDecoratorEntry {
  methodName: string;
  interceptorClass: new (...args: any[]) => unknown;
  adviceType: 'around' | 'before' | 'after';
  order?: number;
}
