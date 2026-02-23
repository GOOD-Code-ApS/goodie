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

/** Stub for future plugin support (Phase 3+). */
export interface TransformerPlugin {
  name: string;
  beforeScan?(): void;
  afterScan?(beans: IRBeanDefinition[]): IRBeanDefinition[];
}
