/**
 * Conditionally register a bean only if no other bean provides the given token.
 *
 * If another bean already provides the specified class token, this bean
 * is filtered out during graph building. Useful for providing default
 * implementations that can be overridden.
 *
 * This decorator is a compile-time no-op -- the transformer scans it
 * via AST and the graph builder evaluates the condition.
 *
 * @param token - The class constructor to check for
 */
export function ConditionalOnMissingBean(
  _token: new (...args: any[]) => any,
): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
