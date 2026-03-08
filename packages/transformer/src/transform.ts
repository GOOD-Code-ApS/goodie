import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import type {
  AopDecoratorDeclaration,
  ResolvedAopMapping,
} from './aop-plugin.js';
import { createDeclarativeAopPlugin } from './aop-plugin.js';
import { scanAopDecoratorDefinitions } from './aop-scanner.js';
import { createAopPlugin } from './builtin-aop-plugin.js';
import { createConditionalPlugin } from './builtin-conditional-plugin.js';
import { createConfigPlugin } from './builtin-config-plugin.js';
import { computeIRHash, extractIRHash, generateCode } from './codegen.js';
import {
  discoverAll,
  discoverPlugins,
  mergePlugins,
} from './discover-plugins.js';
import { buildGraph } from './graph-builder.js';
import type { IRBeanDefinition } from './ir.js';
import {
  deserializeBeans,
  discoverAopMappings,
  rewriteImportPaths,
  serializeBeans,
} from './library-beans.js';
import type {
  CodegenContribution,
  TransformerPlugin,
  TransformLibraryOptions,
  TransformLibraryResult,
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
 *
 * Auto-discovers plugins from installed `@goodie-ts/*` packages unless
 * `options.disablePluginDiscovery` is set to `true`.
 */
export async function transform(
  options: TransformOptions,
): Promise<TransformResult> {
  // 1. Create ts-morph Project
  const project = new Project({
    tsConfigFilePath: options.tsConfigFilePath,
  });

  // If include patterns are specified, filter source files
  if (options.include && options.include.length > 0) {
    project.addSourceFilesAtPaths(options.include);
  }

  const baseDir = path.dirname(options.tsConfigFilePath);

  // Single filesystem discovery pass for plugins + library manifests
  const skipDiscovery =
    options.disablePluginDiscovery && options.disableLibraryBeanDiscovery;
  const discovery = skipDiscovery
    ? { plugins: [], manifests: [], packageDirs: new Map<string, string>() }
    : (options.discoveryCache ??
      (await discoverAll(baseDir, options.scanScopes)));

  const discoveredPlugins = options.disablePluginDiscovery
    ? []
    : discovery.plugins;

  // Extract library beans and AOP mappings from manifests
  const libraryBeans: IRBeanDefinition[] = [];
  const aopMappings: import('./aop-plugin.js').ResolvedAopMapping[] = [];
  if (!options.disableLibraryBeanDiscovery) {
    for (const { packageName, manifest } of discovery.manifests) {
      try {
        libraryBeans.push(...deserializeBeans(manifest));
      } catch (err) {
        console.warn(
          `[@goodie-ts] Failed to deserialize beans from "${manifest.package}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (!options.disablePluginDiscovery && manifest.aop) {
        for (const [decoratorName, declaration] of Object.entries(
          manifest.aop,
        )) {
          aopMappings.push({ decoratorName, declaration, packageName });
        }
      }
    }
  }

  const aopPlugins =
    aopMappings.length > 0 ? [createDeclarativeAopPlugin(aopMappings)] : [];

  // Built-in plugins always active; declarative AOP comes next; then discovered + user plugins
  const builtinPlugins = [
    createAopPlugin(),
    createConfigPlugin(),
    createConditionalPlugin(),
  ];
  const activePlugins = mergePlugins(
    [...builtinPlugins, ...aopPlugins, ...discoveredPlugins],
    options.plugins ?? [],
  );

  // 2. beforeScan hooks
  for (const plugin of activePlugins) {
    plugin.beforeScan?.();
  }

  // 3. Scan (with plugin visitor hooks inlined)
  const scanResult = scan(project, activePlugins);

  // 4. Resolve
  const resolveResult = resolve(scanResult);

  // 5. Merge visitor metadata into beans (before afterResolve so plugins can read it)
  let beans = resolveResult.beans;
  if (scanResult.pluginMetadata) {
    mergePluginMetadata(beans, scanResult.pluginMetadata);
  }

  // 5b. Inject library beans (before afterResolve so plugins see them)
  if (!options.disableLibraryBeanDiscovery && libraryBeans.length > 0) {
    beans = [...beans, ...libraryBeans];
    // Reconcile: scanned deps use absolute paths from ts-morph, but library
    // beans use bare package specifiers. Rewrite dep tokenRefs to match.
    reconcileLibraryImportPaths(beans, libraryBeans, discovery.packageDirs);
  }

  // 6. afterResolve hook
  for (const plugin of activePlugins) {
    if (plugin.afterResolve) {
      beans = plugin.afterResolve(beans);
    }
  }

  // 6b. Reconcile again — plugins may add synthetic beans with bare package specifiers
  // (e.g. TransactionManager from the kysely plugin) that scanned beans reference
  // via absolute paths.
  if (!options.disableLibraryBeanDiscovery) {
    // Collect all beans with bare package specifier import paths (library + plugin-synthesized)
    const bareSpecifierBeans = beans.filter(
      (b) =>
        b.tokenRef.kind === 'class' && !b.tokenRef.importPath.startsWith('/'),
    );
    if (bareSpecifierBeans.length > 0) {
      reconcileLibraryImportPaths(
        beans,
        bareSpecifierBeans,
        discovery.packageDirs,
      );
    }
  }

  // 7. Build graph (validate + topo sort)
  const resolvedConfigDir = options.configDir
    ? path.isAbsolute(options.configDir)
      ? options.configDir
      : path.resolve(baseDir, options.configDir)
    : undefined;
  const graphResult = buildGraph({ ...resolveResult, beans });

  // 8. beforeCodegen hook
  let finalBeans = graphResult.beans;
  for (const plugin of activePlugins) {
    if (plugin.beforeCodegen) {
      finalBeans = plugin.beforeCodegen(finalBeans);
    }
  }

  // 9. Inline config at build time (read JSON files, embed as literal)
  let inlinedConfig: Record<string, string> | undefined;
  if (resolvedConfigDir) {
    inlinedConfig = readAndFlattenConfigFiles(resolvedConfigDir);
  }

  // 10. Collect codegen contributions (pass build-time config to plugins)
  const codegenContext = { config: inlinedConfig ?? {} };
  const contributions: CodegenContribution[] = [];
  for (const plugin of activePlugins) {
    if (plugin.codegen) {
      contributions.push(plugin.codegen(finalBeans, codegenContext));
    }
  }

  // 11. Check IR hash — skip codegen + write if DI graph unchanged
  const codegenOptions = {
    outputPath: options.outputPath,
    version: PKG_VERSION,
    configDir: resolvedConfigDir,
    inlinedConfig,
  };
  const currentHash = computeIRHash(finalBeans, codegenOptions, contributions);

  let existingHash: string | undefined;
  try {
    const existingContent = fs.readFileSync(options.outputPath, 'utf-8');
    existingHash = extractIRHash(existingContent);
  } catch {
    // File doesn't exist yet — proceed with generation
  }

  if (existingHash === currentHash) {
    // Read the existing file for the return value
    const code = fs.readFileSync(options.outputPath, 'utf-8');
    return {
      code,
      outputPath: options.outputPath,
      beans: finalBeans,
      warnings: graphResult.warnings,
      skipped: true,
      discoveryCache: discovery,
    };
  }

  // 11. Generate code (pass pre-computed hash to avoid recomputation)
  const code = generateCode(
    finalBeans,
    { ...codegenOptions, hash: currentHash },
    contributions,
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
    discoveryCache: discovery,
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
  libraryBeans?: IRBeanDefinition[],
  aopMappings?: ResolvedAopMapping[],
  options?: { configDir?: string; inlinedConfig?: Record<string, string> },
): TransformResult {
  const aopPlugins =
    aopMappings && aopMappings.length > 0
      ? [createDeclarativeAopPlugin(aopMappings)]
      : [];
  const builtinPlugins = [
    createAopPlugin(),
    createConfigPlugin(),
    createConditionalPlugin(),
  ];
  const activePlugins = mergePlugins(
    [...builtinPlugins, ...aopPlugins],
    plugins ?? [],
  );

  // 1. beforeScan hooks
  for (const plugin of activePlugins) {
    plugin.beforeScan?.();
  }

  // 2. Scan (with plugin visitor hooks inlined)
  const scanResult = scan(project, activePlugins);

  // 3. Resolve
  const resolveResult = resolve(scanResult);

  // 4. Merge visitor metadata into beans (before afterResolve so plugins can read it)
  let beans = resolveResult.beans;
  if (scanResult.pluginMetadata) {
    mergePluginMetadata(beans, scanResult.pluginMetadata);
  }

  // 4b. Inject library beans (before afterResolve so plugins see them)
  if (libraryBeans && libraryBeans.length > 0) {
    beans = [...beans, ...libraryBeans];
    reconcileLibraryImportPaths(beans, libraryBeans);
  }

  // 5. afterResolve hook
  for (const plugin of activePlugins) {
    if (plugin.afterResolve) {
      beans = plugin.afterResolve(beans);
    }
  }

  // 5b. Reconcile again — plugins may add synthetic beans with bare package specifiers
  if (libraryBeans && libraryBeans.length > 0) {
    const bareSpecifierBeans = beans.filter(
      (b) =>
        b.tokenRef.kind === 'class' && !b.tokenRef.importPath.startsWith('/'),
    );
    if (bareSpecifierBeans.length > 0) {
      reconcileLibraryImportPaths(beans, bareSpecifierBeans);
    }
  }

  // 6. Build graph (validate + topo sort)
  const graphResult = buildGraph({ ...resolveResult, beans });

  // 7. beforeCodegen hook
  let finalBeans = graphResult.beans;
  for (const plugin of activePlugins) {
    if (plugin.beforeCodegen) {
      finalBeans = plugin.beforeCodegen(finalBeans);
    }
  }

  // 8. Collect codegen contributions (pass build-time config to plugins)
  const codegenCtx = { config: options?.inlinedConfig ?? {} };
  const contributions: CodegenContribution[] = [];
  for (const plugin of activePlugins) {
    if (plugin.codegen) {
      contributions.push(plugin.codegen(finalBeans, codegenCtx));
    }
  }

  // 9. Generate code
  const code = generateCode(
    finalBeans,
    {
      outputPath,
      version: PKG_VERSION,
      ...(options?.inlinedConfig
        ? { inlinedConfig: options.inlinedConfig }
        : {}),
    },
    contributions,
  );

  return {
    code,
    outputPath,
    beans: finalBeans,
    warnings: graphResult.warnings,
  };
}

/**
 * Run the transform pipeline in library mode.
 *
 * Scans decorated source, runs the full pipeline (including plugins),
 * then serializes the discovered beans to a `beans.json` manifest instead
 * of emitting generated code. Import paths are rewritten to use the
 * bare package specifier.
 *
 * Auto-discovers plugins from installed `@goodie-ts/*` packages unless
 * `options.disablePluginDiscovery` is set to `true`.
 */
export async function transformLibrary(
  options: TransformLibraryOptions,
): Promise<TransformLibraryResult> {
  // 1. Create ts-morph Project
  const project = new Project({
    tsConfigFilePath: options.tsConfigFilePath,
  });

  if (options.include && options.include.length > 0) {
    project.addSourceFilesAtPaths(options.include);
  }

  const libBaseDir = path.dirname(options.tsConfigFilePath);

  const discovered = options.disablePluginDiscovery
    ? []
    : await discoverPlugins(libBaseDir);

  // Discover declarative AOP mappings (library mode doesn't need them for its own beans,
  // but may need them if codeOutputPath is set for integration tests)
  const aopMappings = options.disablePluginDiscovery
    ? []
    : discoverAopMappings(libBaseDir, ['@goodie-ts']);
  const aopPlugins =
    aopMappings.length > 0 ? [createDeclarativeAopPlugin(aopMappings)] : [];

  const builtinPlugins = [
    createAopPlugin(),
    createConfigPlugin(),
    createConditionalPlugin(),
  ];
  const activePlugins = mergePlugins(
    [...builtinPlugins, ...aopPlugins, ...discovered],
    options.plugins ?? [],
  );

  // 2. beforeScan hooks
  for (const plugin of activePlugins) {
    plugin.beforeScan?.();
  }

  // 3. Scan (with plugin visitor hooks inlined)
  const scanResult = scan(project, activePlugins);

  // 4. Resolve
  const resolveResult = resolve(scanResult);

  // 5. Merge visitor metadata
  let beans = resolveResult.beans;
  if (scanResult.pluginMetadata) {
    mergePluginMetadata(beans, scanResult.pluginMetadata);
  }

  // 6. afterResolve hook
  for (const plugin of activePlugins) {
    if (plugin.afterResolve) {
      beans = plugin.afterResolve(beans);
    }
  }

  // 8. Build graph (validate + topo sort)
  // Conditional rules are evaluated at runtime by ApplicationContext, not at build time.
  const graphResult = buildGraph({ ...resolveResult, beans });

  // 9. beforeCodegen hook (plugins may add synthetic beans)
  let finalBeans = graphResult.beans;
  for (const plugin of activePlugins) {
    if (plugin.beforeCodegen) {
      finalBeans = plugin.beforeCodegen(finalBeans);
    }
  }

  // 10. Generate code (before rewriting import paths — code uses relative imports)
  let code: string | undefined;
  if (options.codeOutputPath) {
    const contributions: CodegenContribution[] = [];
    for (const plugin of activePlugins) {
      if (plugin.codegen) {
        contributions.push(plugin.codegen(finalBeans));
      }
    }

    code = generateCode(
      finalBeans,
      { outputPath: options.codeOutputPath, version: PKG_VERSION },
      contributions,
    );

    const codeDir = path.dirname(options.codeOutputPath);
    fs.mkdirSync(codeDir, { recursive: true });
    fs.writeFileSync(options.codeOutputPath, code, 'utf-8');
  }

  // 11. Determine source root from tsconfig for import path rewriting
  const sourceRoot = path.dirname(options.tsConfigFilePath);

  // 11b. Scan for createAopDecorator<{...}>() calls and build AOP declarations
  const scannedAopDecorators = scanAopDecoratorDefinitions(project);
  let aopDeclarations: Record<string, AopDecoratorDeclaration> | undefined;
  if (scannedAopDecorators.length > 0) {
    aopDeclarations = {};
    for (const dec of scannedAopDecorators) {
      aopDeclarations[dec.decoratorName] = {
        interceptor: dec.interceptorClassName,
        order: dec.order,
        ...(dec.metadata ? { metadata: dec.metadata } : {}),
        ...(dec.argMapping ? { argMapping: dec.argMapping } : {}),
        ...(dec.defaults ? { defaults: dec.defaults } : {}),
      };
    }
  }

  // 11c. Build cross-package directory map for workspace dependencies
  const crossPackageDirs = discoverCrossPackageDirs(libBaseDir);

  // 12. Rewrite import paths from absolute to bare package specifier
  const rewrittenBeans = rewriteImportPaths(
    finalBeans,
    options.packageName,
    sourceRoot,
    crossPackageDirs,
  );

  // 13. Serialize to manifest
  const manifest = serializeBeans(
    rewrittenBeans,
    options.packageName,
    aopDeclarations,
  );

  // 14. Write beans.json
  const outputDir = path.dirname(options.beansOutputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    options.beansOutputPath,
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  return {
    manifest,
    outputPath: options.beansOutputPath,
    beans: rewrittenBeans,
    warnings: graphResult.warnings,
    code,
    codeOutputPath: options.codeOutputPath,
  };
}

/**
 * Reconcile import paths between scanned beans (absolute paths from ts-morph)
 * and library beans (bare package specifiers like `@goodie-ts/kysely`).
 *
 * When user code imports a library class, ts-morph resolves the dependency to
 * the declaration's absolute file path. But the library bean's tokenRef uses
 * a bare package specifier (set by `rewriteImportPaths` during library build).
 * This mismatch causes the graph builder to see them as different tokens.
 *
 * Fix: rewrite dependency tokenRefs in scanned beans to use the library bean's
 * import path when the className matches.
 */
function reconcileLibraryImportPaths(
  allBeans: IRBeanDefinition[],
  libraryBeans: IRBeanDefinition[],
  packageDirs?: Map<string, string>,
): void {
  // Build className → library tokenRef map (skip ambiguous names)
  const libraryClassMap = new Map<
    string,
    IRBeanDefinition['tokenRef'] | null
  >();
  for (const lib of libraryBeans) {
    if (lib.tokenRef.kind !== 'class') continue;
    const name = lib.tokenRef.className;
    if (libraryClassMap.has(name)) {
      // Ambiguous — two library beans with same className, skip both
      libraryClassMap.set(name, null);
    } else {
      libraryClassMap.set(name, lib.tokenRef);
    }
  }

  function reconcileRef(
    ref: IRBeanDefinition['tokenRef'],
  ): IRBeanDefinition['tokenRef'] {
    if (ref.kind !== 'class') return ref;
    const libRef = libraryClassMap.get(ref.className);
    if (libRef && libRef.kind === 'class') {
      // Only rewrite if the import paths differ (scanned has absolute, lib has bare specifier)
      if (ref.importPath !== libRef.importPath) {
        return { ...ref, importPath: libRef.importPath };
      }
      return ref;
    }
    // Fallback: class isn't a bean but may live in a library package.
    // Check if the absolute import path falls under a known library package directory.
    if (packageDirs && ref.importPath.startsWith('/')) {
      for (const [realDir, pkgName] of packageDirs) {
        if (ref.importPath.startsWith(`${realDir}/`)) {
          return { ...ref, importPath: pkgName };
        }
      }
    }
    return ref;
  }

  for (const bean of allBeans) {
    for (const dep of bean.constructorDeps) {
      dep.tokenRef = reconcileRef(dep.tokenRef);
    }
    for (const field of bean.fieldDeps) {
      field.tokenRef = reconcileRef(field.tokenRef);
    }
    if (bean.baseTokenRefs) {
      bean.baseTokenRefs = bean.baseTokenRefs.map(
        (ref) => reconcileRef(ref) as typeof ref,
      );
    }
  }
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
      for (const [key, value] of Object.entries(meta)) {
        const existing = bean.metadata[key];
        // Merge arrays (e.g. valueFields from scanner + plugin) instead of overwriting
        if (Array.isArray(existing) && Array.isArray(value)) {
          bean.metadata[key] = [...existing, ...value];
        } else {
          bean.metadata[key] = value;
        }
      }
    }
  }
}

/**
 * Discover workspace dependency directories for cross-package import path rewriting.
 *
 * Scans `node_modules/@goodie-ts/` under the library base dir for sibling packages.
 * Returns a map of real directory path → bare package name. This enables
 * `rewriteImportPaths` to convert absolute cross-package references
 * (e.g. `ServerConfig` from `@goodie-ts/hono`) to bare specifiers in `beans.json`.
 */
function discoverCrossPackageDirs(
  libBaseDir: string,
): Map<string, string> | undefined {
  const result = new Map<string, string>();
  const scopes = ['@goodie-ts'];

  for (const scope of scopes) {
    const scopeDir = path.join(libBaseDir, 'node_modules', scope);

    let entries: string[];
    try {
      entries = fs.readdirSync(scopeDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const pkgJsonPath = path.join(scopeDir, entry, 'package.json');
      try {
        const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
        const pkgJson = JSON.parse(raw);
        const pkgName = pkgJson.name as string | undefined;
        if (!pkgName) continue;

        const realDir = fs.realpathSync(path.join(scopeDir, entry));
        result.set(realDir, pkgName);
      } catch {}
    }
  }

  return result.size > 0 ? result : undefined;
}

/**
 * Read and flatten JSON config files at build time.
 * Mirrors `loadConfigFiles()` from core but runs during transformation,
 * so the values can be inlined in the generated code.
 */
function readAndFlattenConfigFiles(dir: string): Record<string, string> {
  const result: Record<string, string> = {};

  const defaultFile = path.join(dir, 'default.json');
  if (fs.existsSync(defaultFile)) {
    Object.assign(
      result,
      flattenObject(JSON.parse(fs.readFileSync(defaultFile, 'utf-8'))),
    );
  }

  // Also read {NODE_ENV}.json (e.g. production.json) to match runtime behavior
  const env = process.env.NODE_ENV;
  if (env) {
    const envFile = path.join(dir, `${env}.json`);
    if (fs.existsSync(envFile)) {
      Object.assign(
        result,
        flattenObject(JSON.parse(fs.readFileSync(envFile, 'utf-8'))),
      );
    }
  }

  return result;
}

function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(
        result,
        flattenObject(value as Record<string, unknown>, fullKey),
      );
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}
