/** Context passed to method interceptors. */
export interface InvocationContext {
  /** The name of the class the method belongs to. */
  className: string;
  /** The name of the intercepted method. */
  methodName: string;
  /** The arguments passed to the method. */
  args: unknown[];
  /** The target object instance. */
  target: unknown;
  /** Call the next interceptor in the chain, or the original method if last. */
  proceed(...args: unknown[]): unknown | Promise<unknown>;
}

/** Interface for method interceptors. */
export interface MethodInterceptor {
  intercept(ctx: InvocationContext): unknown | Promise<unknown>;
}

/** Descriptor for an intercepted method (stored in bean metadata). */
export interface InterceptedMethodDescriptor {
  /** The name of the intercepted method. */
  methodName: string;
  /** References to interceptor bean classes. Each entry is { className, importPath }. */
  interceptorTokenRefs: Array<{ className: string; importPath: string }>;
  /** Execution order (lower = runs first). */
  order: number;
}
