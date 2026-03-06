/**
 * Marks a class as a typed configuration properties holder.
 *
 * When used alongside `@Singleton()`, the config transformer plugin reads all
 * fields from the class and maps them to config keys using the given prefix:
 *
 * ```typescript
 * @Singleton()
 * @ConfigurationProperties('database')
 * class DatabaseConfig {
 *   host = 'localhost';
 *   port = 5432;
 * }
 * // Resolves: database.host, database.port from __Goodie_Config
 * ```
 *
 * Field initializers become default values. Config values from `process.env`
 * (or `withConfig()` overrides in tests) take precedence.
 *
 * @param prefix - Dot-separated prefix prepended to each field name as the config key.
 */
export function ConfigurationProperties(
  _prefix: string,
): (
  target: abstract new (...args: any[]) => unknown,
  context: ClassDecoratorContext,
) => void {
  return () => {};
}
