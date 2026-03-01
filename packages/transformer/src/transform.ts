import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { generateCode } from './codegen.js';
import { buildGraph } from './graph-builder.js';
import type { TransformOptions, TransformResult } from './options.js';
import { resolve } from './resolver.js';
import { scan } from './scanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_VERSION: string = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'),
).version;

/**
 * Run the full compile-time transform pipeline:
 *   Source Files → Scanner → Resolver → Graph Builder → Code Generator → output file
 */
export function transform(options: TransformOptions): TransformResult {
  // 1. Create ts-morph Project
  const project = new Project({
    tsConfigFilePath: options.tsConfigFilePath,
  });

  // If include patterns are specified, filter source files
  if (options.include && options.include.length > 0) {
    project.addSourceFilesAtPaths(options.include);
  }

  // 2. Scan
  const scanResult = scan(project);

  // 3. Resolve
  const resolveResult = resolve(scanResult);

  // 4. Build graph (validate + topo sort)
  const graphResult = buildGraph(resolveResult);

  // 5. Generate code
  const code = generateCode(
    graphResult.beans,
    {
      outputPath: options.outputPath,
      version: PKG_VERSION,
    },
    graphResult.controllers,
  );

  // 6. Write output
  const outputDir = path.dirname(options.outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(options.outputPath, code, 'utf-8');

  return {
    code,
    outputPath: options.outputPath,
    beans: graphResult.beans,
    warnings: graphResult.warnings,
  };
}

/**
 * Run the pipeline in-memory without writing to disk.
 * Useful for testing and tooling integration.
 */
export function transformInMemory(
  project: Project,
  outputPath: string,
): TransformResult {
  const scanResult = scan(project);
  const resolveResult = resolve(scanResult);
  const graphResult = buildGraph(resolveResult);
  const code = generateCode(
    graphResult.beans,
    {
      outputPath,
      version: PKG_VERSION,
    },
    graphResult.controllers,
  );

  return {
    code,
    outputPath,
    beans: graphResult.beans,
    warnings: graphResult.warnings,
  };
}
