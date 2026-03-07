/**
 * Conditionally register a bean based on a configuration property.
 *
 * When `value` is provided, the bean is only registered if the
 * config property at `key` equals `value`. When `value` is omitted,
 * the bean is registered if the property exists (is not undefined).
 *
 * Configuration is loaded from the `configDir` (default.json + {env}.json).
 *
 * This decorator is a compile-time no-op -- the transformer scans it
 * via AST and the graph builder evaluates the condition.
 *
 * @param key - The configuration property key (e.g. 'database.type')
 * @param value - Optional expected value
 */
export function ConditionalOnProperty(
  _key: string,
  _value?: string,
): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
