import fs from 'node:fs';
import path from 'node:path';
import type {
  AopDecoratorDeclaration,
  ResolvedAopMapping,
} from './aop-plugin.js';
import type { IRComponentDefinition } from './ir.js';

/** Manifest format for library-shipped component definitions. */
export interface LibraryComponentsManifest {
  /** Schema version. Currently must be 1. */
  version: number;
  /** npm package name (for diagnostics). */
  package: string;
  /** Serialized IRComponentDefinition[]. */
  components: Record<string, unknown>[];
  /** AOP decorator declarations, keyed by decorator name. */
  aop?: Record<string, AopDecoratorDeclaration>;
}

/**
 * Serialize IR components into a JSON-safe manifest.
 *
 * - `undefined` values become `null` (JSON constraint)
 * - `typeImports` Maps become plain objects
 */
export function serializeComponents(
  components: IRComponentDefinition[],
  packageName: string,
  aop?: Record<string, AopDecoratorDeclaration>,
): LibraryComponentsManifest {
  const manifest: LibraryComponentsManifest = {
    version: 1,
    package: packageName,
    components: components.map((component) => serializeComponent(component)),
  };
  if (aop && Object.keys(aop).length > 0) {
    manifest.aop = aop;
  }
  return manifest;
}

function serializeComponent(
  component: IRComponentDefinition,
): Record<string, unknown> {
  return {
    tokenRef: serializeTokenRef(component.tokenRef),
    scope: component.scope,
    eager: component.eager,
    name: component.name ?? null,
    primary: component.primary,
    constructorDeps: component.constructorDeps.map((dep) => ({
      tokenRef: serializeTokenRef(dep.tokenRef),
      optional: dep.optional,
      collection: dep.collection,
      sourceLocation: dep.sourceLocation,
    })),
    fieldDeps: component.fieldDeps.map((dep) => ({
      fieldName: dep.fieldName,
      tokenRef: serializeTokenRef(dep.tokenRef),
      optional: dep.optional,
    })),
    factoryKind: component.factoryKind,
    providesSource: component.providesSource ?? null,
    baseTokenRefs: component.baseTokenRefs ?? null,
    decorators: component.decorators ?? null,
    methodDecorators: component.methodDecorators ?? null,
    publicMembers: component.publicMembers ?? null,
    metadata: component.metadata,
    sourceLocation: component.sourceLocation,
  };
}

function serializeTokenRef(
  tokenRef: IRComponentDefinition['tokenRef'],
): Record<string, unknown> {
  if (tokenRef.kind === 'class') {
    return {
      kind: 'class',
      className: tokenRef.className,
      importPath: tokenRef.importPath,
    };
  }
  return {
    kind: 'injection-token',
    tokenName: tokenRef.tokenName,
    importPath: tokenRef.importPath ?? null,
    typeAnnotation: tokenRef.typeAnnotation ?? null,
    typeImports: tokenRef.typeImports
      ? Object.fromEntries(tokenRef.typeImports)
      : null,
  };
}

/**
 * Deserialize a manifest back into IRComponentDefinition[].
 *
 * - Validates the version field
 * - Converts `null` → `undefined` for optional fields
 * - Converts typeImports plain objects → Maps
 */
export function deserializeComponents(
  manifest: LibraryComponentsManifest,
): IRComponentDefinition[] {
  if (manifest.version !== 1) {
    throw new Error(
      `Unsupported components.json version ${manifest.version} from package "${manifest.package}". ` +
        'Expected version 1. Update @goodie-ts/transformer to support this version.',
    );
  }

  return manifest.components.map((raw) => deserializeComponent(raw));
}

function deserializeComponent(
  raw: Record<string, unknown>,
): IRComponentDefinition {
  const rawTokenRef = raw.tokenRef as Record<string, unknown>;
  const rawConstructorDeps = raw.constructorDeps as Record<string, unknown>[];
  const rawFieldDeps = raw.fieldDeps as Record<string, unknown>[];
  const rawProvidesSource = raw.providesSource as Record<
    string,
    unknown
  > | null;
  const rawBaseTokenRefs = raw.baseTokenRefs as
    | Record<string, unknown>[]
    | null;

  return {
    tokenRef: deserializeTokenRef(rawTokenRef),
    scope: raw.scope as IRComponentDefinition['scope'],
    eager: raw.eager as boolean,
    name: (raw.name as string) ?? undefined,
    primary: (raw.primary as boolean) ?? false,
    constructorDeps: rawConstructorDeps.map((dep) => ({
      tokenRef: deserializeTokenRef(dep.tokenRef as Record<string, unknown>),
      optional: dep.optional as boolean,
      collection: dep.collection as boolean,
      sourceLocation:
        dep.sourceLocation as IRComponentDefinition['sourceLocation'],
    })),
    fieldDeps: rawFieldDeps.map((dep) => ({
      fieldName: dep.fieldName as string,
      tokenRef: deserializeTokenRef(dep.tokenRef as Record<string, unknown>),
      optional: dep.optional as boolean,
    })),
    factoryKind: raw.factoryKind as IRComponentDefinition['factoryKind'],
    providesSource: rawProvidesSource
      ? {
          moduleTokenRef:
            rawProvidesSource.moduleTokenRef as IRComponentDefinition['tokenRef'] & {
              kind: 'class';
            },
          methodName: rawProvidesSource.methodName as string,
        }
      : undefined,
    baseTokenRefs: rawBaseTokenRefs
      ? rawBaseTokenRefs.map(
          (ref) =>
            deserializeTokenRef(ref) as IRComponentDefinition['tokenRef'] & {
              kind: 'class';
            },
        )
      : undefined,
    decorators:
      (raw.decorators as IRComponentDefinition['decorators']) ?? undefined,
    methodDecorators:
      (raw.methodDecorators as IRComponentDefinition['methodDecorators']) ??
      undefined,
    publicMembers:
      (raw.publicMembers as IRComponentDefinition['publicMembers']) ??
      undefined,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    sourceLocation:
      raw.sourceLocation as IRComponentDefinition['sourceLocation'],
  };
}

function deserializeTokenRef(
  raw: Record<string, unknown>,
): IRComponentDefinition['tokenRef'] {
  if (raw.kind === 'class') {
    return {
      kind: 'class',
      className: raw.className as string,
      importPath: raw.importPath as string,
    };
  }

  const rawTypeImports = raw.typeImports as Record<string, string> | null;

  return {
    kind: 'injection-token',
    tokenName: raw.tokenName as string,
    importPath: (raw.importPath as string) ?? undefined,
    typeAnnotation: (raw.typeAnnotation as string) ?? undefined,
    typeImports: rawTypeImports
      ? new Map(Object.entries(rawTypeImports))
      : undefined,
  };
}

/** Result of scanning a single package's components.json manifest. */
export interface ScannedManifest {
  packageName: string;
  manifest: LibraryComponentsManifest;
}

/**
 * Scan `node_modules` for packages with `"goodie": { "components": "..." }` and
 * read their components.json manifests. Shared by `discoverLibraryComponents` and
 * `discoverAopMappings` to avoid duplicate filesystem scanning.
 */
function scanLibraryManifests(
  baseDir?: string,
  scanScopes?: string[],
): ScannedManifest[] {
  const root = baseDir ?? process.cwd();
  const scopes = scanScopes ?? ['@goodie-ts'];
  const results: ScannedManifest[] = [];

  for (const scope of scopes) {
    const scopeDir = path.join(root, 'node_modules', scope);

    let entries: string[];
    try {
      entries = fs.readdirSync(scopeDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const pkgJsonPath = path.join(scopeDir, entry, 'package.json');

      let raw: string;
      try {
        raw = fs.readFileSync(pkgJsonPath, 'utf-8');
      } catch {
        continue;
      }

      let pkgJson: Record<string, unknown>;
      try {
        pkgJson = JSON.parse(raw);
      } catch {
        continue;
      }

      const packageName = pkgJson.name as string | undefined;
      if (!packageName) continue;

      const goodieField = pkgJson.goodie as { components?: string } | undefined;
      if (!goodieField?.components) continue;

      const componentsJsonPath = path.resolve(
        scopeDir,
        entry,
        goodieField.components,
      );

      try {
        const componentsRaw = fs.readFileSync(componentsJsonPath, 'utf-8');
        const manifest: LibraryComponentsManifest = JSON.parse(componentsRaw);
        results.push({ packageName, manifest });
      } catch (err) {
        console.warn(
          `[@goodie-ts] Failed to load components.json from ${scope}/${entry}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return results;
}

/**
 * Discover library components from installed packages.
 *
 * Scans `node_modules` for packages in the given scopes (default: `['@goodie-ts']`)
 * that declare a `"goodie": { "components": "..." }` field in their `package.json`.
 * Reads and deserializes each components.json manifest.
 *
 * @param baseDir - Directory to resolve `node_modules` from. Defaults to `process.cwd()`.
 * @param scanScopes - npm scopes to scan. Defaults to `['@goodie-ts']`.
 */
export async function discoverLibraryComponents(
  baseDir?: string,
  scanScopes?: string[],
): Promise<IRComponentDefinition[]> {
  const allComponents: IRComponentDefinition[] = [];

  for (const { manifest } of scanLibraryManifests(baseDir, scanScopes)) {
    try {
      allComponents.push(...deserializeComponents(manifest));
    } catch (err) {
      console.warn(
        `[@goodie-ts] Failed to deserialize components from "${manifest.package}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return allComponents;
}

/**
 * Rewrite import paths in component definitions to use bare package specifiers.
 *
 * Converts absolute file paths to the package name for library components
 * that will be published. Used by `transformLibrary` (Phase 2).
 *
 * @param components - Component definitions with absolute import paths.
 * @param packageName - npm package name to use as import path.
 * @param sourceRoot - Absolute path prefix to match and replace.
 * @param crossPackageDirs - Additional root→packageName mappings for cross-package refs.
 */
export function rewriteImportPaths(
  components: IRComponentDefinition[],
  packageName: string,
  sourceRoot: string,
  crossPackageDirs?: Map<string, string>,
): IRComponentDefinition[] {
  return components.map((component) => ({
    ...component,
    tokenRef: rewriteTokenRefPath(
      component.tokenRef,
      packageName,
      sourceRoot,
      crossPackageDirs,
    ),
    decorators: component.decorators?.map((d) => ({
      ...d,
      importPath: rewritePlainPath(
        d.importPath,
        packageName,
        sourceRoot,
        crossPackageDirs,
      ),
    })),
    methodDecorators: component.methodDecorators
      ? Object.fromEntries(
          Object.entries(component.methodDecorators).map(([method, decs]) => [
            method,
            decs.map((d) => ({
              ...d,
              importPath: rewritePlainPath(
                d.importPath,
                packageName,
                sourceRoot,
                crossPackageDirs,
              ),
            })),
          ]),
        )
      : undefined,
    constructorDeps: component.constructorDeps.map((dep) => ({
      ...dep,
      tokenRef: rewriteTokenRefPath(
        dep.tokenRef,
        packageName,
        sourceRoot,
        crossPackageDirs,
      ),
      sourceLocation: {
        ...dep.sourceLocation,
        filePath: dep.sourceLocation.filePath.startsWith(sourceRoot)
          ? packageName
          : dep.sourceLocation.filePath,
      },
    })),
    fieldDeps: component.fieldDeps.map((dep) => ({
      ...dep,
      tokenRef: rewriteTokenRefPath(
        dep.tokenRef,
        packageName,
        sourceRoot,
        crossPackageDirs,
      ),
    })),
    baseTokenRefs: component.baseTokenRefs?.map(
      (ref) =>
        rewriteTokenRefPath(
          ref,
          packageName,
          sourceRoot,
          crossPackageDirs,
        ) as typeof ref,
    ),
    sourceLocation: {
      ...component.sourceLocation,
      filePath: component.sourceLocation.filePath.startsWith(sourceRoot)
        ? packageName
        : component.sourceLocation.filePath,
    },
  }));
}

function rewritePlainPath(
  importPath: string,
  packageName: string,
  sourceRoot: string,
  crossPackageDirs?: Map<string, string>,
): string {
  if (importPath.startsWith(sourceRoot)) return packageName;
  if (crossPackageDirs) {
    for (const [dir, pkgName] of crossPackageDirs) {
      if (importPath.startsWith(`${dir}/`)) return pkgName;
    }
  }
  return importPath;
}

function rewriteTokenRefPath(
  tokenRef: IRComponentDefinition['tokenRef'],
  packageName: string,
  sourceRoot: string,
  crossPackageDirs?: Map<string, string>,
): IRComponentDefinition['tokenRef'] {
  if (tokenRef.kind === 'class' && tokenRef.importPath.startsWith(sourceRoot)) {
    return { ...tokenRef, importPath: packageName };
  }
  if (
    tokenRef.kind === 'injection-token' &&
    tokenRef.importPath?.startsWith(sourceRoot)
  ) {
    return { ...tokenRef, importPath: packageName };
  }
  // Cross-package fallback: match absolute paths from workspace dependencies
  if (crossPackageDirs && tokenRef.kind === 'class') {
    for (const [dir, pkgName] of crossPackageDirs) {
      if (tokenRef.importPath.startsWith(`${dir}/`)) {
        return { ...tokenRef, importPath: pkgName };
      }
    }
  }
  return tokenRef;
}

/**
 * Discover AOP decorator mappings from installed packages.
 *
 * Scans `node_modules` for packages with components.json manifests and extracts
 * the `aop` section from each.
 *
 * @param baseDir - Directory to resolve `node_modules` from. Defaults to `process.cwd()`.
 * @param scanScopes - npm scopes to scan. Defaults to `['@goodie-ts']`.
 */
export function discoverAopMappings(
  baseDir?: string,
  scanScopes?: string[],
): ResolvedAopMapping[] {
  const allMappings: ResolvedAopMapping[] = [];

  for (const { packageName, manifest } of scanLibraryManifests(
    baseDir,
    scanScopes,
  )) {
    if (!manifest.aop) continue;

    for (const [decoratorName, declaration] of Object.entries(manifest.aop)) {
      allMappings.push({ decoratorName, declaration, packageName });
    }
  }

  return allMappings;
}

/** Combined result from a single discovery pass. */
export interface DiscoveryResult {
  components: IRComponentDefinition[];
  aopMappings: ResolvedAopMapping[];
}

/**
 * Discover both library components and AOP mappings in a single filesystem pass.
 *
 * Equivalent to calling `discoverLibraryComponents()` + `discoverAopMappings()`
 * but reads each components.json only once.
 */
export function discoverLibraryManifests(
  baseDir?: string,
  scanScopes?: string[],
): DiscoveryResult {
  const components: IRComponentDefinition[] = [];
  const aopMappings: ResolvedAopMapping[] = [];

  for (const { packageName, manifest } of scanLibraryManifests(
    baseDir,
    scanScopes,
  )) {
    try {
      components.push(...deserializeComponents(manifest));
    } catch (err) {
      console.warn(
        `[@goodie-ts] Failed to deserialize components from "${manifest.package}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (manifest.aop) {
      for (const [decoratorName, declaration] of Object.entries(manifest.aop)) {
        aopMappings.push({ decoratorName, declaration, packageName });
      }
    }
  }

  return { components: components, aopMappings };
}
