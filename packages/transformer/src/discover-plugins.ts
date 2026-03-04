import fs from 'node:fs';
import path from 'node:path';
import type { TransformerPlugin } from './options.js';

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
  const root = baseDir ?? process.cwd();
  const scopes = scanScopes ?? ['@goodie-ts'];
  const plugins: TransformerPlugin[] = [];

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

      const goodieField = pkgJson.goodie as { plugin?: string } | undefined;
      if (!goodieField?.plugin) continue;

      const pluginEntryPath = path.resolve(scopeDir, entry, goodieField.plugin);

      try {
        const mod = await import(pluginEntryPath);
        const factory = mod.default;
        if (typeof factory !== 'function') {
          console.warn(
            `[@goodie-ts] Plugin "${scope}/${entry}" does not have a default export function — skipping.`,
          );
          continue;
        }
        const plugin = factory() as TransformerPlugin;
        plugins.push(plugin);
      } catch (err) {
        console.warn(
          `[@goodie-ts] Failed to load plugin from ${scope}/${entry}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return plugins;
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
