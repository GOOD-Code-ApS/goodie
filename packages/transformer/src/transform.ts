import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { generateCode } from './codegen.js';
import { buildGraph } from './graph-builder.js';
import type { IRBeanDefinition } from './ir.js';
import type {
  ClassVisitorContext,
  CodegenContribution,
  MethodVisitorContext,
  TransformerPlugin,
  TransformOptions,
  TransformResult,
} from './options.js';
import { resolve } from './resolver.js';
import { scan } from './scanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_VERSION: string = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'),
).version;

/**
 * Run the full compile-time transform pipeline:
 *   Source Files -> Scanner -> Resolver -> Graph Builder -> Code Generator -> output file
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

  const activePlugins = options.plugins ?? [];

  // 2. beforeScan hooks
  for (const plugin of activePlugins) {
    plugin.beforeScan?.();
  }

  // 3. Scan
  const scanResult = scan(project);

  // 4. Run visitClass and visitMethod hooks
  const pluginClassMetadata = runPluginVisitors(project, activePlugins);

  // 5. Resolve
  const resolveResult = resolve(scanResult);

  // 6. Merge visitor metadata into beans (before afterResolve so plugins can read it)
  let beans = resolveResult.beans;
  mergePluginMetadata(beans, pluginClassMetadata);

  // 7. afterResolve hook
  for (const plugin of activePlugins) {
    if (plugin.afterResolve) {
      beans = plugin.afterResolve(beans);
    }
  }

  // 8. Build graph (validate + topo sort)
  const graphResult = buildGraph({ ...resolveResult, beans });

  // 9. beforeCodegen hook
  let finalBeans = graphResult.beans;
  for (const plugin of activePlugins) {
    if (plugin.beforeCodegen) {
      finalBeans = plugin.beforeCodegen(finalBeans);
    }
  }

  // 10. Collect codegen contributions
  const contributions: CodegenContribution[] = [];
  for (const plugin of activePlugins) {
    if (plugin.codegen) {
      contributions.push(plugin.codegen(finalBeans));
    }
  }

  // 11. Generate code
  const code = generateCode(
    finalBeans,
    { outputPath: options.outputPath, version: PKG_VERSION },
    contributions,
    graphResult.controllers,
  );

  // 12. Write output
  const outputDir = path.dirname(options.outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(options.outputPath, code, 'utf-8');

  return {
    code,
    outputPath: options.outputPath,
    beans: finalBeans,
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
  plugins?: TransformerPlugin[],
): TransformResult {
  const activePlugins = plugins ?? [];

  // 1. beforeScan hooks
  for (const plugin of activePlugins) {
    plugin.beforeScan?.();
  }

  // 2. Scan
  const scanResult = scan(project);

  // 3. Run visitClass and visitMethod hooks
  const pluginClassMetadata = runPluginVisitors(project, activePlugins);

  // 4. Resolve
  const resolveResult = resolve(scanResult);

  // 5. Merge visitor metadata into beans (before afterResolve so plugins can read it)
  let beans = resolveResult.beans;
  mergePluginMetadata(beans, pluginClassMetadata);

  // 6. afterResolve hook
  for (const plugin of activePlugins) {
    if (plugin.afterResolve) {
      beans = plugin.afterResolve(beans);
    }
  }

  // 7. Build graph (validate + topo sort)
  const graphResult = buildGraph({ ...resolveResult, beans });

  // 8. beforeCodegen hook
  let finalBeans = graphResult.beans;
  for (const plugin of activePlugins) {
    if (plugin.beforeCodegen) {
      finalBeans = plugin.beforeCodegen(finalBeans);
    }
  }

  // 9. Collect codegen contributions
  const contributions: CodegenContribution[] = [];
  for (const plugin of activePlugins) {
    if (plugin.codegen) {
      contributions.push(plugin.codegen(finalBeans));
    }
  }

  // 10. Generate code
  const code = generateCode(
    finalBeans,
    { outputPath, version: PKG_VERSION },
    contributions,
    graphResult.controllers,
  );

  return {
    code,
    outputPath,
    beans: finalBeans,
    warnings: graphResult.warnings,
  };
}

/**
 * Run visitClass and visitMethod hooks across all plugins.
 * Returns a map of "filePath:className" -> accumulated metadata.
 */
function runPluginVisitors(
  project: Project,
  plugins: TransformerPlugin[],
): Map<string, Record<string, unknown>> {
  const classMetadataMap = new Map<string, Record<string, unknown>>();

  if (plugins.every((p) => !p.visitClass && !p.visitMethod)) {
    return classMetadataMap; // No visitor hooks, skip iteration
  }

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName();
      if (!className) continue;

      const decorators = cls.getDecorators();
      if (decorators.length === 0) continue;

      const metadata: Record<string, unknown> = {};
      const metadataKey = `${sourceFile.getFilePath()}:${className}`;
      classMetadataMap.set(metadataKey, metadata);

      const classCtx: ClassVisitorContext = {
        classDeclaration: cls,
        className,
        filePath: sourceFile.getFilePath(),
        metadata,
      };

      for (const plugin of plugins) {
        plugin.visitClass?.(classCtx);
      }

      // Visit methods
      for (const method of cls.getMethods()) {
        const methodCtx: MethodVisitorContext = {
          methodDeclaration: method,
          methodName: method.getName(),
          className,
          filePath: sourceFile.getFilePath(),
          classMetadata: metadata,
        };

        for (const plugin of plugins) {
          plugin.visitMethod?.(methodCtx);
        }
      }
    }
  }

  return classMetadataMap;
}

/**
 * Merge plugin-accumulated class metadata into the matching IR beans.
 * Keys are "filePath:className" to avoid collisions between same-named classes in different files.
 */
function mergePluginMetadata(
  beans: IRBeanDefinition[],
  pluginMetadata: Map<string, Record<string, unknown>>,
): void {
  for (const bean of beans) {
    if (bean.tokenRef.kind !== 'class') continue;

    const metadataKey = `${bean.tokenRef.importPath}:${bean.tokenRef.className}`;
    const meta = pluginMetadata.get(metadataKey);
    if (meta && Object.keys(meta).length > 0) {
      Object.assign(bean.metadata, meta);
    }
  }
}
