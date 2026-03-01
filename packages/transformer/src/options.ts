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

  /** Called after scanning completes, receives all scanned beans as IR. */
  afterScan?(beans: IRBeanDefinition[]): IRBeanDefinition[];

  /**
   * Visit each class found during scanning.
   * Called for every decorated class (beans and modules).
   */
  visitClass?(ctx: ClassVisitorContext): void;

  /**
   * Visit each method on bean classes during scanning.
   * Called for every method on classes that have visitClass called on them.
   */
  visitMethod?(ctx: MethodVisitorContext): void;

  /**
   * Mutate IR beans after resolution, before graph building.
   * Can modify metadata, add dependencies, etc.
   */
  afterResolve?(beans: IRBeanDefinition[]): IRBeanDefinition[];

  /**
   * Inject synthetic bean definitions before codegen.
   * Runs after graph building -- returned beans are added to the final list.
   */
  beforeCodegen?(beans: IRBeanDefinition[]): IRBeanDefinition[];

  /**
   * Contribute additional imports and code to the generated file.
   * Called during code generation.
   */
  codegen?(beans: IRBeanDefinition[]): CodegenContribution;
}
