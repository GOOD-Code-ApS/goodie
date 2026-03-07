/** Options for the @Value decorator. */
export interface ValueOptions {
  /** Default value when the config key is missing. */
  default?: unknown;
}

/**
 * Injects a configuration value by key.
 *
 * The config source is a bean registered under the `__Goodie_Config` token,
 * which defaults to `process.env` and can be overridden via `createContext(config)`.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @param _key  The config key to inject (e.g. `'DB_URL'`)
 * @param _options  Optional default value
 *
 * @example
 * @Singleton()
 * class DbService {
 *   @Value('DB_URL') accessor dbUrl!: string
 *   @Value('PORT', { default: 3000 }) accessor port!: number
 * }
 */
export function Value(
  _key: string,
  _options?: ValueOptions,
): FieldDecorator_Stage3 {
  return () => {};
}

type FieldDecorator_Stage3 = (
  target: ClassAccessorDecoratorTarget<unknown, unknown>,
  context: ClassAccessorDecoratorContext,
) => void;
