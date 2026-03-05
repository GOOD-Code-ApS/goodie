// @goodie-ts/transformer — Phase 2: Compile-time DI transformer

// Declarative AOP plugin
export type {
  AopDecoratorDeclaration,
  ResolvedAopMapping,
} from './aop-plugin.js';
export { createDeclarativeAopPlugin } from './aop-plugin.js';
// AOP decorator scanner
export type { ScannedAopDecorator } from './aop-scanner.js';
export { scanAopDecoratorDefinitions } from './aop-scanner.js';
export type { CodegenOptions } from './codegen.js';
// Code Generator
export { generateCode } from './codegen.js';
// Plugin discovery
export type { DiscoverAllResult } from './discover-plugins.js';
export {
  discoverAll,
  discoverPlugins,
  mergePlugins,
} from './discover-plugins.js';
export type { GraphResult } from './graph-builder.js';
// Graph Builder
export { buildGraph } from './graph-builder.js';
// IR types
export type {
  ClassTokenRef,
  InjectionTokenRef,
  IRBeanDefinition,
  IRControllerDefinition,
  IRDependency,
  IRFieldInjection,
  IRModule,
  IRProvides,
  IRRouteDefinition,
  SourceLocation,
  TokenRef,
} from './ir.js';
// Library bean discovery
export type { DiscoveryResult, LibraryBeansManifest } from './library-beans.js';
export {
  deserializeBeans,
  discoverAopMappings,
  discoverLibraryBeans,
  discoverLibraryManifests,
  rewriteImportPaths,
  serializeBeans,
} from './library-beans.js';
// Options
export type {
  ClassVisitorContext,
  CodegenContribution,
  MethodVisitorContext,
  TransformerPlugin,
  TransformLibraryOptions,
  TransformLibraryResult,
  TransformOptions,
  TransformResult,
} from './options.js';
export type { ResolveResult } from './resolver.js';
// Resolver
export { resolve } from './resolver.js';
export type {
  HttpMethod,
  ScannedBean,
  ScannedConstructorParam,
  ScannedController,
  ScannedFieldInjection,
  ScannedModule,
  ScannedModuleImport,
  ScannedProvides,
  ScannedRoute,
  ScannedTypeArgument,
  ScanResult,
} from './scanner.js';
// Scanner
export { scan } from './scanner.js';
// Pipeline
export { transform, transformInMemory, transformLibrary } from './transform.js';
// Errors
export {
  AmbiguousProviderError,
  CircularDependencyError,
  GenericTypeResolutionError,
  InvalidDecoratorUsageError,
  MissingProviderError,
  TransformerError,
  UnresolvableTypeError,
} from './transformer-errors.js';
