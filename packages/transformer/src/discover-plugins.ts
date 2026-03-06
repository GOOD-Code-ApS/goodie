import fs from 'node:fs';
import path from 'node:path';
import type { LibraryBeansManifest } from './library-beans.js';
import type { TransformerPlugin } from './options.js';

/** Result of a combined discovery pass (plugins + library manifests). */
export interface DiscoverAllResult {
  plugins: TransformerPlugin[];
  manifests: Array<{ packageName: string; manifest: LibraryBeansManifest }>;
  /** Maps resolved real directory path → bare package name for each discovered library package. */
  packageDirs: Map<string, string>;
}

/**
 * Auto-discover transformer plugins AND library bean manifests from installed packages
 * in a single filesystem scan.
 *
 * For each package in `node_modules` within the given scopes:
 * - If `"goodie": { "plugin": "..." }` exists → load and call the plugin factory
 * - If `"goodie": { "beans": "..." }` exists → read the beans.json manifest
 *
 * @param baseDir - Directory to resolve `node_modules` from. Defaults to `process.cwd()`.
 * @param scanScopes - npm scopes to scan. Defaults to `['@goodie-ts']`.
 */
export async function discoverAll(
  baseDir?: string,
  scanScopes?: string[],
): Promise<DiscoverAllResult> {
  const root = baseDir ?? process.cwd();
  const scopes = scanScopes ?? ['@goodie-ts'];
  const plugins: TransformerPlugin[] = [];
  const manifests: DiscoverAllResult['manifests'] = [];
  const packageDirs: Map<string, string> = new Map();

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

      const goodieField = pkgJson.goodie as
        | { plugin?: string; beans?: string }
        | undefined;
      if (!goodieField) continue;

      // Resolve the real path (follows symlinks, e.g. pnpm workspaces)
      const packageName = pkgJson.name as string | undefined;
      if (packageName) {
        try {
          const realDir = fs.realpathSync(path.join(scopeDir, entry));
          packageDirs.set(realDir, packageName);
        } catch {
          // Symlink target doesn't exist — skip
        }
      }

      // Plugin discovery
      if (goodieField.plugin) {
        const pluginEntryPath = path.resolve(
          scopeDir,
          entry,
          goodieField.plugin,
        );
        try {
          const mod = await import(pluginEntryPath);
          const factory = mod.default;
          if (typeof factory !== 'function') {
            console.warn(
              `[@goodie-ts] Plugin "${scope}/${entry}" does not have a default export function — skipping.`,
            );
          } else {
            const plugin = factory() as TransformerPlugin;
            plugins.push(plugin);
          }
        } catch (err) {
          console.warn(
            `[@goodie-ts] Failed to load plugin from ${scope}/${entry}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Library manifest discovery
      if (goodieField.beans) {
        if (!packageName) continue;

        const beansJsonPath = path.resolve(scopeDir, entry, goodieField.beans);
        try {
          const beansRaw = fs.readFileSync(beansJsonPath, 'utf-8');
          const manifest: LibraryBeansManifest = JSON.parse(beansRaw);
          manifests.push({ packageName, manifest });
        } catch (err) {
          console.warn(
            `[@goodie-ts] Failed to load beans.json from ${scope}/${entry}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  return { plugins, manifests, packageDirs };
}

/**
 * Auto-discover transformer plugins from installed packages.
 *
 * Scans `node_modules` for packages (within the given scopes) with a
 * `"goodie": { "plugin": "..." }` field in their `package.json`. Each
 * discovered plugin entry is dynamically imported and its default export
 * (a no-arg factory) is called to produce a `TransformerPlugin`.
 *
 * @param baseDir - Directory to resolve `node_modules` from. Defaults to `process.cwd()`.
 * @param scanScopes - npm scopes to scan. Defaults to `['@goodie-ts']`.
 */
export async function discoverPlugins(
  baseDir?: string,
  scanScopes?: string[],
): Promise<TransformerPlugin[]> {
  const result = await discoverAll(baseDir, scanScopes);
  return result.plugins;
}

/**
 * Merge discovered and explicit plugins, deduplicating by `name`.
 *
 * Discovered plugins come first. Explicit plugins override discovered ones
 * with the same name (last-write-wins).
 */
export function mergePlugins(
  discovered: TransformerPlugin[],
  explicit: TransformerPlugin[],
): TransformerPlugin[] {
  const map = new Map<string, TransformerPlugin>();

  for (const plugin of discovered) {
    map.set(plugin.name, plugin);
  }
  for (const plugin of explicit) {
    map.set(plugin.name, plugin);
  }

  return [...map.values()];
}
