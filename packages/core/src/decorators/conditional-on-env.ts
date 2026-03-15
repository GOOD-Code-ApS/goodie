/**
 * Conditionally register a component based on an environment variable.
 *
 * When `value` is provided, the component is only registered if
 * `process.env[envVar] === value`. When `value` is omitted,
 * the component is registered if `process.env[envVar]` is defined.
 *
 * This decorator is a compile-time no-op -- the transformer scans it
 * via AST and the graph builder evaluates the condition.
 *
 * @param envVar - The environment variable name to check
 * @param value - Optional expected value
 */
export function ConditionalOnEnv(
  _envVar: string,
  _value?: string,
): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
