import fs from 'node:fs';
import path from 'node:path';
import type { IRBeanDefinition } from './ir.js';

/** Manifest format for library-shipped bean definitions. */
export interface LibraryBeansManifest {
  /** Schema version. Currently must be 1. */
  version: number;
  /** npm package name (for diagnostics). */
  package: string;
  /** Serialized IRBeanDefinition[]. */
  beans: Record<string, unknown>[];
}

/**
 * Serialize IR beans into a JSON-safe manifest.
 *
 * - `undefined` values become `null` (JSON constraint)
 * - `typeImports` Maps become plain objects
 */
export function serializeBeans(
  beans: IRBeanDefinition[],
  packageName: string,
): LibraryBeansManifest {
  return {
    version: 1,
    package: packageName,
    beans: beans.map((bean) => serializeBean(bean)),
  };
}

function serializeBean(bean: IRBeanDefinition): Record<string, unknown> {
  return {
    tokenRef: serializeTokenRef(bean.tokenRef),
    scope: bean.scope,
    eager: bean.eager,
    name: bean.name ?? null,
    constructorDeps: bean.constructorDeps.map((dep) => ({
      tokenRef: serializeTokenRef(dep.tokenRef),
      optional: dep.optional,
      collection: dep.collection,
      sourceLocation: dep.sourceLocation,
    })),
    fieldDeps: bean.fieldDeps.map((dep) => ({
      fieldName: dep.fieldName,
      tokenRef: serializeTokenRef(dep.tokenRef),
      optional: dep.optional,
    })),
    factoryKind: bean.factoryKind,
    providesSource: bean.providesSource ?? null,
    baseTokenRefs: bean.baseTokenRefs ?? null,
    metadata: bean.metadata,
    sourceLocation: bean.sourceLocation,
  };
}

function serializeTokenRef(
  tokenRef: IRBeanDefinition['tokenRef'],
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
 * Deserialize a manifest back into IRBeanDefinition[].
 *
 * - Validates the version field
 * - Converts `null` → `undefined` for optional fields
 * - Converts typeImports plain objects → Maps
 */
export function deserializeBeans(
  manifest: LibraryBeansManifest,
): IRBeanDefinition[] {
  if (manifest.version !== 1) {
    throw new Error(
      `Unsupported beans.json version ${manifest.version} from package "${manifest.package}". ` +
        'Expected version 1. Update @goodie-ts/transformer to support this version.',
    );
  }

  return manifest.beans.map((raw) => deserializeBean(raw));
}

function deserializeBean(raw: Record<string, unknown>): IRBeanDefinition {
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
    scope: raw.scope as IRBeanDefinition['scope'],
    eager: raw.eager as boolean,
    name: (raw.name as string) ?? undefined,
    constructorDeps: rawConstructorDeps.map((dep) => ({
      tokenRef: deserializeTokenRef(dep.tokenRef as Record<string, unknown>),
      optional: dep.optional as boolean,
      collection: dep.collection as boolean,
      sourceLocation: dep.sourceLocation as IRBeanDefinition['sourceLocation'],
    })),
    fieldDeps: rawFieldDeps.map((dep) => ({
      fieldName: dep.fieldName as string,
      tokenRef: deserializeTokenRef(dep.tokenRef as Record<string, unknown>),
      optional: dep.optional as boolean,
    })),
    factoryKind: raw.factoryKind as IRBeanDefinition['factoryKind'],
    providesSource: rawProvidesSource
      ? {
          moduleTokenRef:
            rawProvidesSource.moduleTokenRef as IRBeanDefinition['tokenRef'] & {
              kind: 'class';
            },
          methodName: rawProvidesSource.methodName as string,
        }
      : undefined,
    baseTokenRefs: rawBaseTokenRefs
      ? rawBaseTokenRefs.map(
          (ref) =>
            deserializeTokenRef(ref) as IRBeanDefinition['tokenRef'] & {
              kind: 'class';
            },
        )
      : undefined,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    sourceLocation: raw.sourceLocation as IRBeanDefinition['sourceLocation'],
  };
}

function deserializeTokenRef(
  raw: Record<string, unknown>,
): IRBeanDefinition['tokenRef'] {
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

/**
 * Discover library beans from installed packages.
 *
 * Scans `node_modules` for packages in the given scopes (default: `['@goodie-ts']`)
 * that declare a `"goodie": { "beans": "..." }` field in their `package.json`.
 * Reads and deserializes each beans.json manifest.
 *
 * @param baseDir - Directory to resolve `node_modules` from. Defaults to `process.cwd()`.
 * @param scanScopes - npm scopes to scan. Defaults to `['@goodie-ts']`.
 */
export async function discoverLibraryBeans(
  baseDir?: string,
  scanScopes?: string[],
): Promise<IRBeanDefinition[]> {
  const root = baseDir ?? process.cwd();
  const scopes = scanScopes ?? ['@goodie-ts'];
  const allBeans: IRBeanDefinition[] = [];

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

      const goodieField = pkgJson.goodie as { beans?: string } | undefined;
      if (!goodieField?.beans) continue;

      const beansJsonPath = path.resolve(scopeDir, entry, goodieField.beans);

      try {
        const beansRaw = fs.readFileSync(beansJsonPath, 'utf-8');
        const manifest: LibraryBeansManifest = JSON.parse(beansRaw);
        const beans = deserializeBeans(manifest);
        allBeans.push(...beans);
      } catch (err) {
        console.warn(
          `[@goodie-ts] Failed to load beans.json from ${scope}/${entry}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return allBeans;
}

/**
 * Rewrite import paths in bean definitions to use bare package specifiers.
 *
 * Converts absolute file paths to the package name for library beans
 * that will be published. Used by `transformLibrary` (Phase 2).
 *
 * @param beans - Bean definitions with absolute import paths.
 * @param packageName - npm package name to use as import path.
 * @param sourceRoot - Absolute path prefix to match and replace.
 */
export function rewriteImportPaths(
  beans: IRBeanDefinition[],
  packageName: string,
  sourceRoot: string,
): IRBeanDefinition[] {
  return beans.map((bean) => ({
    ...bean,
    tokenRef: rewriteTokenRefPath(bean.tokenRef, packageName, sourceRoot),
    constructorDeps: bean.constructorDeps.map((dep) => ({
      ...dep,
      tokenRef: rewriteTokenRefPath(dep.tokenRef, packageName, sourceRoot),
    })),
    fieldDeps: bean.fieldDeps.map((dep) => ({
      ...dep,
      tokenRef: rewriteTokenRefPath(dep.tokenRef, packageName, sourceRoot),
    })),
    baseTokenRefs: bean.baseTokenRefs?.map(
      (ref) => rewriteTokenRefPath(ref, packageName, sourceRoot) as typeof ref,
    ),
    sourceLocation: {
      ...bean.sourceLocation,
      filePath: bean.sourceLocation.filePath.startsWith(sourceRoot)
        ? packageName
        : bean.sourceLocation.filePath,
    },
  }));
}

function rewriteTokenRefPath(
  tokenRef: IRBeanDefinition['tokenRef'],
  packageName: string,
  sourceRoot: string,
): IRBeanDefinition['tokenRef'] {
  if (tokenRef.kind === 'class' && tokenRef.importPath.startsWith(sourceRoot)) {
    return { ...tokenRef, importPath: packageName };
  }
  if (
    tokenRef.kind === 'injection-token' &&
    tokenRef.importPath?.startsWith(sourceRoot)
  ) {
    return { ...tokenRef, importPath: packageName };
  }
  return tokenRef;
}
