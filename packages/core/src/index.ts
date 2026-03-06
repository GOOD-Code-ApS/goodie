import './polyfills.js';

// AOP runtime
export { wrapAfterAdvice, wrapBeforeAdvice } from './advice-wrappers.js';
export type {
  AdviceContext,
  AfterAdvice,
  BeforeAdvice,
  InterceptedMethodDescriptor,
  InterceptorRef,
  InvocationContext,
  MethodInterceptor,
} from './aop-types.js';
export { ApplicationContext } from './application-context.js';
export type { BeanDefinition, Dependency } from './bean-definition.js';
export type { BeanPostProcessor } from './bean-post-processor.js';
export { flattenObject, loadConfigFiles } from './config-loader.js';
export type {
  AfterOptions,
  AopDecoratorConfig,
  AroundOptions,
  BeforeOptions,
  ModuleOptions,
  ValueOptions,
} from './decorators/index.js';
// Decorators
export {
  After,
  Around,
  Before,
  ConfigurationProperties,
  createAopDecorator,
  Eager,
  getClassMetadata,
  Inject,
  Injectable,
  META,
  Module,
  Named,
  Optional,
  PostConstruct,
  PostProcessor,
  PreDestroy,
  Provides,
  pushMeta,
  Singleton,
  setMeta,
  Value,
} from './decorators/index.js';
export {
  AsyncBeanNotReadyError,
  CircularDependencyError,
  ContextClosedError,
  DIError,
  MissingDependencyError,
  OverrideError,
} from './errors.js';
export { Goodie, GoodieBuilder } from './goodie.js';
export { InjectionToken } from './injection-token.js';
export { buildInterceptorChain } from './interceptor-chain.js';
export { topoSort } from './topo-sort.js';
export type { AbstractConstructor, Constructor, Scope } from './types.js';
