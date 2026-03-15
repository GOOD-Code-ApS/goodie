import type { Scope } from '@goodie-ts/core';
import type { ClassDeclaration, MethodDeclaration, SourceFile } from 'ts-morph';
import type { IRComponentDefinition, IRDecoratorEntry } from './ir.js';

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
  /** Skip auto-discovery of library components from installed packages. */
  disableLibraryComponentDiscovery?: boolean;
  /**
   * npm scopes to scan for library components and plugins (e.g. `['@goodie-ts', '@acme']`).
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

/** Options for building a library's components.json manifest. */
export interface TransformLibraryOptions {
  /** Path to the tsconfig.json used to create the ts-morph Project. */
  tsConfigFilePath: string;
  /** npm package name (e.g. `'@goodie-ts/health'`). Used in the manifest and to rewrite import paths. */
  packageName: string;
  /** Absolute path for the generated components.json file. */
  componentsOutputPath: string;
  /**
   * Absolute path for the generated TypeScript code file.
   * When set, library mode emits both components.json AND generated code
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
  /** The serialized components.json manifest. */
  manifest: import('./library-components.js').LibraryComponentsManifest;
  /** Absolute path where the manifest was written. */
  outputPath: string;
  /** All discovered component definitions (with rewritten import paths). */
  components: import('./ir.js').IRComponentDefinition[];
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
  /** All discovered component definitions in topological order. */
  components: IRComponentDefinition[];
  /** Non-fatal warnings encountered during transformation. */
  warnings: string[];
  /** True when codegen was skipped because the IR hash matched the existing file. */
  skipped?: boolean;
  /** Discovery result that can be passed as `discoveryCache` on subsequent runs. */
  discoveryCache?: import('./discover-plugins.js').DiscoverAllResult;
  /** Additional files emitted by plugins to the __generated__/ directory. */
  emittedFiles?: EmittedFile[];
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
   * Register this class as a component from a plugin.
   * Allows plugins to make decorated classes into components without the scanner
   * hardcoding knowledge of plugin-specific decorators (e.g. `@Controller`).
   *
   * @param options.scope - Component scope ('singleton' or 'transient')
   * @param options.decoratorName - Name of the decorator for error messages (e.g. 'Controller')
   * @throws If another plugin has already registered this class as a component
   */
  registerComponent(options: { scope: Scope; decoratorName?: string }): void;
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

/** Plugin interface for extending the transformer pipeline. */
export interface TransformerPlugin {
  /** Unique plugin name. */
  name: string;

  /** Called before scanning begins. */
  beforeScan?(): void;

  /**
   * Visit each decorated class found during scanning.
   * Called for every class with at least one decorator (components, modules, etc.).
   * Use `ctx.metadata` to store data that will be merged into the component's IR metadata.
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
   * Mutate IR components after type resolution, before graph building.
   * Can modify metadata, add dependencies, filter components, etc.
   *
   * Metadata accumulated via `visitClass` (`ctx.metadata`) is already merged
   * into each component's `metadata` before this hook runs, so you can read
   * visitor-produced tags here.
   *
   * **Note:** This hook receives only `@Transient`/`@Singleton` components.
   * Components created by `@Provides` methods inside `@Factory` classes are expanded
   * during graph building (the next pipeline stage) and are not visible here.
   * Use `beforeCodegen` if you need to see the full expanded component set.
   */
  afterResolve?(components: IRComponentDefinition[]): IRComponentDefinition[];

  /**
   * Inject or modify component definitions before code generation.
   * Runs after graph building (validation + topo sort).
   *
   * This is the only hook that sees the full component set including `@Provides` components.
   *
   * **Warning:** Synthetic components added here bypass dependency validation and
   * topological sorting. Ensure any injected components have their dependencies
   * already present in the component list, or are self-contained (no dependencies).
   */
  beforeCodegen?(components: IRComponentDefinition[]): IRComponentDefinition[];

  /**
   * Emit additional generated files alongside the main context.ts.
   * Runs after `beforeCodegen` when the final component set is known.
   *
   * Use `ctx.createSourceFile(relativePath)` to create ts-morph `SourceFile` instances.
   * Each created file is written to the `__generated__/` directory.
   * Files are included in the IR hash — if no inputs change, no files are rewritten.
   *
   * This hook is **app-build only** — it runs during `transform()` (vite-plugin, CLI)
   * but not during `transformLibrary()`.
   *
   * Use this to generate adapter-specific code (route wiring, validation schemas,
   * migration sequencing) that depends on the consumer's application components.
   */
  emitFiles?(context: EmitFilesContext): void;
}

/** Context passed to the emitFiles hook. */
export interface EmitFilesContext {
  /** The final set of components (after graph building + beforeCodegen). */
  components: IRComponentDefinition[];
  /**
   * Type registrations for `@Introspected` classes.
   * Each entry contains the class name, import path, and serialized field metadata
   * (field types + decorator metadata). Matches what codegen emits as
   * `MetadataRegistry.INSTANCE.register(...)` calls.
   */
  typeRegistrations: ReadonlyArray<{
    className: string;
    importPath: string;
    fields: unknown[];
  }>;
  /**
   * Compute a relative import path from the __generated__/ directory to a source file.
   * Handles `.ts` → `.js` extension rewriting.
   */
  relativeImport(absolutePath: string): string;
  /**
   * Create a ts-morph `SourceFile` that will be written to `__generated__/<relativePath>`.
   * Returns a `SourceFile` that the plugin can manipulate using the full ts-morph API
   * (add imports, classes, functions, statements, etc.).
   *
   * @param relativePath - Filename relative to __generated__/ (e.g. 'routes.ts')
   * @returns A ts-morph SourceFile for type-safe code generation
   */
  createSourceFile(relativePath: string): SourceFile;
}

/** A file emitted by a plugin to the __generated__/ directory. */
export interface EmittedFile {
  /** Filename relative to __generated__/ (e.g. 'routes.ts'). */
  relativePath: string;
  /** The generated TypeScript source content. */
  content: string;
}
