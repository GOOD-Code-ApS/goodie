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

/** Full-control interceptor — wraps the entire method execution. */
export interface MethodInterceptor {
  intercept(ctx: InvocationContext): unknown | Promise<unknown>;
}

/** Advice context without proceed (used by BeforeAdvice and AfterAdvice). */
export type AdviceContext = Omit<InvocationContext, 'proceed'>;

/** Advice that runs before the method. Cannot modify args or short-circuit. */
export interface BeforeAdvice {
  before(ctx: AdviceContext): void | Promise<void>;
}

/** Advice that runs after the method. Receives the result. */
export interface AfterAdvice {
  after(ctx: AdviceContext, result: unknown): void | Promise<void>;
}

/** Reference to a single interceptor (stored in bean metadata). */
export interface InterceptorRef {
  /** Class name of the interceptor bean. */
  className: string;
  /** Absolute import path for collision-safe identity. */
  importPath: string;
  /** Which advice type this interceptor provides. */
  adviceType: 'around' | 'before' | 'after';
  /** Execution order (lower = runs first). */
  order: number;
}

/** Descriptor for an intercepted method (stored in bean metadata). */
export interface InterceptedMethodDescriptor {
  /** The name of the intercepted method. */
  methodName: string;
  /** Ordered list of interceptor references. */
  interceptors: InterceptorRef[];
}
