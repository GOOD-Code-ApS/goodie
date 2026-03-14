/**
 * Marks a singleton component as a ComponentPostProcessor.
 *
 * The transformer will set `metadata.isPostProcessor = true` on the
 * generated ComponentDefinition, so the runtime discovers it automatically.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @PostProcessor()
 * @Singleton()
 * class LoggingPostProcessor implements ComponentPostProcessor {
 *   afterInit(bean: unknown) { console.log('created', bean); return bean; }
 * }
 */
export function PostProcessor(): ClassDecorator_Stage3 {
  return () => {};
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
