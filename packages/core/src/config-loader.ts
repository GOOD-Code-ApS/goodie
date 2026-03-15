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
