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
// Built-in plugins
export { createAopPlugin } from './builtin-aop-plugin.js';
export type { ConditionalRule } from './builtin-conditional-plugin.js';
export { createConditionalPlugin } from './builtin-conditional-plugin.js';
export { createConfigPlugin } from './builtin-config-plugin.js';
export { createIntrospectionPlugin } from './builtin-introspection-plugin.js';
export type { CodegenOptions, TypeRegistration } from './codegen.js';
// Code Generator
export { generateCode } from './codegen.js';
// Decorator parsing utilities
export type { ParsedDecoratorMeta } from './decorator-utils.js';
export { extractDecoratorMeta } from './decorator-utils.js';
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
  IRComponentDefinition,
  IRDecoratorEntry,
  IRDependency,
  IRFieldInjection,
  IRProvides,
  IRPublicMember,
  SourceLocation,
  TokenRef,
} from './ir.js';
// Library bean discovery
export type {
  DiscoveryResult,
  LibraryComponentsManifest,
} from './library-components.js';
export {
  deserializeComponents,
  discoverAopMappings,
  discoverLibraryComponents,
  discoverLibraryManifests,
  rewriteImportPaths,
  serializeComponents,
} from './library-components.js';
// Options
export type {
  ClassVisitorContext,
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
  ScannedBean,
  ScannedConstructorParam,
  ScannedFieldInjection,
  ScannedProvides,
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
