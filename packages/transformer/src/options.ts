import type { Scope } from '@goodie-ts/core';
import type { ClassDeclaration, MethodDeclaration } from 'ts-morph';
import type { IRBeanDefinition, IRDecoratorEntry } from './ir.js';

/** Options for the compile-time transform pipeline. */
export interface TransformOptions {
  /** Path to the tsconfig.json used to create the ts-morph Project. */
  tsConfigFilePath: string;
  /** Absolute path for the generated output file. */
  outputPath: string;
  /**
   * Source file globs to scan (relative to tsconfig root).
   * Defaults to all .ts files in the project.
   */
  include?: string[];
  /** Plugins to extend the transformer pipeline. Merged with auto-discovered plugins. */
  plugins?: TransformerPlugin[];
  /** Skip auto-discovery of plugins from installed packages. */
  disablePluginDiscovery?: boolean;
  /** Skip auto-discovery of library beans from installed packages. */
  disableLibraryBeanDiscovery?: boolean;
  /**
   * npm scopes to scan for library beans and plugins (e.g. `['@goodie-ts', '@acme']`).
   * Defaults to `['@goodie-ts']`.
   */
  scanScopes?: string[];
  /**
   * Cached discovery result from a previous run.
   * When set, the filesystem scan for plugins + library manifests is skipped.
   * Useful in watch mode where `node_modules` doesn't change between rebuilds.
   */
  discoveryCache?: import('./discover-plugins.js').DiscoverAllResult;
  /**
   * Directory containing JSON config files (`default.json`, `{env}.json`).
   * When set, the generated `__Goodie_Config` factory merges file-based config
   * before `process.env` (priority: file defaults < env file < process.env < explicit config).
   */
  configDir?: string;
}

/** Options for building a library's beans.json manifest. */
export interface TransformLibraryOptions {
  /** Path to the tsconfig.json used to create the ts-morph Project. */
  tsConfigFilePath: string;
  /** npm package name (e.g. `'@goodie-ts/health'`). Used in the manifest and to rewrite import paths. */
  packageName: string;
  /** Absolute path for the generated beans.json file. */
  beansOutputPath: string;
  /**
   * Absolute path for the generated TypeScript code file.
   * When set, library mode emits both beans.json AND generated code
   * (useful for the library's own integration tests).
   */
  codeOutputPath?: string;
  /**
   * Source file globs to scan (relative to tsconfig root).
   * Defaults to all .ts files in the project.
   */
  include?: string[];
  /** Plugins to extend the transformer pipeline. Merged with auto-discovered plugins. */
  plugins?: TransformerPlugin[];
  /** Skip auto-discovery of plugins from installed packages. */
  disablePluginDiscovery?: boolean;
}

/** Result returned by the library transform pipeline. */
export interface TransformLibraryResult {
  /** The serialized beans.json manifest. */
  manifest: import('./library-beans.js').LibraryBeansManifest;
  /** Absolute path where the manifest was written. */
  outputPath: string;
  /** All discovered bean definitions (with rewritten import paths). */
  beans: import('./ir.js').IRBeanDefinition[];
  /** Non-fatal warnings encountered during transformation. */
  warnings: string[];
  /** Generated TypeScript code (only when `codeOutputPath` is set). */
  code?: string;
  /** Absolute path where the generated code was written (only when `codeOutputPath` is set). */
  codeOutputPath?: string;
}

/** Result returned by the transform pipeline. */
export interface TransformResult {
  /** The generated source code. */
  code: string;
  /** Absolute path where the file was written. */
  outputPath: string;
  /** All discovered bean definitions in topological order. */
  beans: IRBeanDefinition[];
  /** Non-fatal warnings encountered during transformation. */
  warnings: string[];
  /** True when codegen was skipped because the IR hash matched the existing file. */
  skipped?: boolean;
  /** Discovery result that can be passed as `discoveryCache` on subsequent runs. */
  discoveryCache?: import('./discover-plugins.js').DiscoverAllResult;
}

/** Context passed to visitClass hook. */
export interface ClassVisitorContext {
  /** The ts-morph ClassDeclaration being visited. */
  classDeclaration: ClassDeclaration;
  /** The class name. */
  className: string;
  /** Absolute path to the source file. */
  filePath: string;
  /** All decorators found on this class with resolved import paths. */
  decorators: IRDecoratorEntry[];
  /** Store arbitrary metadata that will be available in later hooks. */
  metadata: Record<string, unknown>;
  /**
   * Register this class as a bean from a plugin.
   * Allows plugins to make decorated classes into beans without the scanner
   * hardcoding knowledge of plugin-specific decorators (e.g. `@Controller`).
   *
   * @param options.scope - Bean scope ('singleton' or 'prototype')
   * @param options.decoratorName - Name of the decorator for error messages (e.g. 'Controller')
   * @throws If another plugin has already registered this class as a bean
   */
  registerBean(options: { scope: Scope; decoratorName?: string }): void;
}

/** Context passed to visitMethod hook. */
export interface MethodVisitorContext {
  /** The ts-morph MethodDeclaration being visited. */
  methodDeclaration: MethodDeclaration;
  /** The method name. */
  methodName: string;
  /** The class this method belongs to. */
  className: string;
  /** Absolute path to the source file. */
  filePath: string;
  /** Metadata accumulated for this class (shared with visitClass). */
  classMetadata: Record<string, unknown>;
  /** All decorators found on the owning class with resolved import paths. */
  classDecorators: IRDecoratorEntry[];
  /** All decorators found on this method with resolved import paths. */
  decorators: IRDecoratorEntry[];
}

/** Contribution from a plugin's codegen hook. */
export interface CodegenContribution {
  /** Import statements to add at the top of the generated file. */
  imports?: string[];
  /** Code lines to add after the bean definitions. */
  code?: string[];
  /** Body lines for an `app.onStart()` hook. Codegen wraps them in `app.onStart(async (ctx) => { ... })`. */
  onStart?: string[];
}

/** Context passed to plugin codegen hooks. */
export interface CodegenContext {
  /** Flattened config values read from config files at build time (e.g. `{ 'server.runtime': 'cloudflare' }`). */
  config: Record<string, string>;
}

/** Plugin interface for extending the transformer pipeline. */
export interface TransformerPlugin {
  /** Unique plugin name. */
  name: string;

  /** Called before scanning begins. */
  beforeScan?(): void;

  /**
   * Visit each decorated class found during scanning.
   * Called for every class with at least one decorator (beans, modules, etc.).
   * Use `ctx.metadata` to store data that will be merged into the bean's IR metadata.
   */
  visitClass?(ctx: ClassVisitorContext): void;

  /**
   * Visit each method on decorated classes during scanning.
   * Called for **all** methods on classes that have `visitClass` called on them,
   * including non-DI methods (helpers, lifecycle methods, etc.).
   * Use `ctx.classMetadata` to accumulate data (shared with `visitClass`).
   */
  visitMethod?(ctx: MethodVisitorContext): void;

  /**
   * Mutate IR beans after type resolution, before graph building.
   * Can modify metadata, add dependencies, filter beans, etc.
   *
   * Metadata accumulated via `visitClass` (`ctx.metadata`) is already merged
   * into each bean's `metadata` before this hook runs, so you can read
   * visitor-produced tags here.
   *
   * **Note:** This hook receives only `@Injectable`/`@Singleton` beans.
   * Beans created by `@Provides` methods inside `@Module` classes are expanded
   * during graph building (the next pipeline stage) and are not visible here.
   * Use `beforeCodegen` if you need to see the full expanded bean set.
   */
  afterResolve?(beans: IRBeanDefinition[]): IRBeanDefinition[];

  /**
   * Inject or modify bean definitions before code generation.
   * Runs after graph building (validation + topo sort).
   *
   * This is the only hook that sees the full bean set including `@Provides` beans.
   *
   * **Warning:** Synthetic beans added here bypass dependency validation and
   * topological sorting. Ensure any injected beans have their dependencies
   * already present in the bean list, or are self-contained (no dependencies).
   */
  beforeCodegen?(beans: IRBeanDefinition[]): IRBeanDefinition[];

  /**
   * Contribute additional imports and code to the generated file.
   * Called during code generation. Duplicate imports across plugins are
   * automatically deduplicated.
   */
  codegen?(
    beans: IRBeanDefinition[],
    context?: CodegenContext,
  ): CodegenContribution;
}
