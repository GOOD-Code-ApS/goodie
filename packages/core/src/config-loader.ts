import fs from 'node:fs';
import path from 'node:path';

/**
 * Flatten a nested object into dot-separated keys with string values.
 *
 * All leaf values are converted to strings via `String(value)`.
 * Arrays are coerced to comma-separated strings (e.g. `[1,2,3]` → `"1,2,3"`).
 *
 * @example
 * ```ts
 * flattenObject({ database: { host: 'localhost', port: 5432 } })
 * // => { 'database.host': 'localhost', 'database.port': '5432' }
 * ```
 */
export function flattenObject(
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

/**
 * Load and merge JSON config files from a directory.
 *
 * Merge priority (last wins): `default.json` < `{env}.json`.
 * The returned map uses dot-separated keys for nested objects.
 *
 * @param dir  - Absolute path to the directory containing config files.
 * @param env  - Environment name (e.g. from `process.env.NODE_ENV`). When set,
 *               `{env}.json` is loaded and merged on top of `default.json`.
 * @returns Flattened config map with string values.
 */
export function loadConfigFiles(
  dir: string,
  env?: string,
): Record<string, string> {
  const result: Record<string, string> = {};

  const defaultFile = path.join(dir, 'default.json');
  if (fs.existsSync(defaultFile)) {
    Object.assign(result, flattenObject(parseJsonFile(defaultFile)));
  }

  if (env) {
    const envFile = path.join(dir, `${env}.json`);
    if (fs.existsSync(envFile)) {
      Object.assign(result, flattenObject(parseJsonFile(envFile)));
    }
  }

  return result;
}

function parseJsonFile(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(
      `Failed to parse config file '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
