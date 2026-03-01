export { wrapAfterAdvice, wrapBeforeAdvice } from './advice-wrappers.js';
export { createAopPlugin } from './aop-transformer-plugin.js';
export { After } from './decorators/after.js';
export { Around } from './decorators/around.js';
export { Before } from './decorators/before.js';
export { buildInterceptorChain } from './interceptor-chain.js';
export type {
  AdviceContext,
  AfterAdvice,
  BeforeAdvice,
  InterceptedMethodDescriptor,
  InterceptorRef,
  InvocationContext,
  MethodInterceptor,
} from './types.js';
