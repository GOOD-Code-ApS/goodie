import type { ClassDeclaration, MethodDeclaration } from 'ts-morph';
import type { IRBeanDefinition } from './ir.js';

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
  /** Plugins to extend the transformer pipeline. */
  plugins?: TransformerPlugin[];
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
}

/** Context passed to visitClass hook. */
export interface ClassVisitorContext {
  /** The ts-morph ClassDeclaration being visited. */
  classDeclaration: ClassDeclaration;
  /** The class name. */
  className: string;
  /** Absolute path to the source file. */
  filePath: string;
  /** Store arbitrary metadata that will be available in later hooks. */
  metadata: Record<string, unknown>;
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
}

/** Contribution from a plugin's codegen hook. */
export interface CodegenContribution {
  /** Import statements to add at the top of the generated file. */
  imports?: string[];
  /** Code lines to add after the bean definitions. */
  code?: string[];
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
  codegen?(beans: IRBeanDefinition[]): CodegenContribution;
}
