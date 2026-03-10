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
  ConditionalOnPropertyOptions,
  IntrospectedOptions,
  ModuleOptions,
  ValueOptions,
} from './decorators/index.js';
// Decorators
export {
  After,
  Around,
  Before,
  ConditionalOnEnv,
  ConditionalOnMissingBean,
  ConditionalOnProperty,
  ConfigurationProperties,
  createAopDecorator,
  Eager,
  Inject,
  Injectable,
  Introspected,
  Module,
  Named,
  Optional,
  PostConstruct,
  PostProcessor,
  PreDestroy,
  Provides,
  RequestScoped,
  Singleton,
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
export type {
  ArrayFieldType,
  DecoratorMeta,
  FieldType,
  IntrospectedField,
  LiteralFieldType,
  NullableFieldType,
  OptionalFieldType,
  PrimitiveFieldType,
  ReferenceFieldType,
  TypeMetadata,
  UnionFieldType,
} from './introspection.js';
export { MetadataRegistry } from './introspection.js';
export { RequestScopeManager } from './request-scope.js';
export { StartupMetrics } from './startup-metrics.js';
export { topoSort } from './topo-sort.js';
export type {
  AbstractConstructor,
  Constructor,
  DecoratorEntry,
  Scope,
} from './types.js';
