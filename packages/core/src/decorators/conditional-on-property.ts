/** Options for @ConditionalOnProperty. */
export interface ConditionalOnPropertyOptions {
  /** Expected value(s). Bean is registered if the property matches any of the values. */
  havingValue: string | string[];
}

/**
 * Conditionally register a bean based on a configuration property.
 *
 * Overloads:
 * - `@ConditionalOnProperty('key')` — registered if the property exists
 * - `@ConditionalOnProperty('key', 'value')` — registered if property equals value
 * - `@ConditionalOnProperty('key', { havingValue: 'value' })` — same as above
 * - `@ConditionalOnProperty('key', { havingValue: ['a', 'b'] })` — registered if property matches any value
 *
 * Note: non-string property values are coerced via `String()` for comparison
 * (e.g. `false` → `'false'`, `0` → `'0'`, `null` → `'null'`).
 *
 * Configuration is loaded from the `configDir` (default.json + {env}.json).
 *
 * This decorator is a compile-time no-op -- the transformer scans it
 * via AST and the graph builder evaluates the condition.
 *
 * @param key - The configuration property key (e.g. 'datasource.dialect')
 * @param valueOrOptions - Optional expected value string, or options object with `havingValue`
 */
export function ConditionalOnProperty(
  _key: string,
  _valueOrOptions?: string | ConditionalOnPropertyOptions,
): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
