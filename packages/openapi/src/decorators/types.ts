/** Stage 3 method decorator signature. */
export type MethodDec = (
  target: Function,
  context: ClassMethodDecoratorContext,
) => void;
