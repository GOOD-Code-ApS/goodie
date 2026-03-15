/** Stage 3 method decorator signature. */
export type MethodDec = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
