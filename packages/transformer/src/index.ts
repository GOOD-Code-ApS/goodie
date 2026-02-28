// @goodie-ts/transformer — Phase 2: Compile-time DI transformer

export type { CodegenOptions } from './codegen.js';
// Code Generator
export { generateCode } from './codegen.js';
export type { GraphResult } from './graph-builder.js';
// Graph Builder
export { buildGraph } from './graph-builder.js';
// IR types
export type {
  ClassTokenRef,
  InjectionTokenRef,
  IRBeanDefinition,
  IRDependency,
  IRFieldInjection,
  IRModule,
  IRProvides,
  SourceLocation,
  TokenRef,
} from './ir.js';
// Options
export type {
  TransformerPlugin,
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
  ScannedModule,
  ScannedModuleImport,
  ScannedProvides,
  ScannedTypeArgument,
  ScanResult,
} from './scanner.js';

// Scanner
export { scan } from './scanner.js';
// Pipeline
export { transform, transformInMemory } from './transform.js';
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
