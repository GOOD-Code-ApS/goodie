/**
 * Marks a singleton bean as a BeanPostProcessor.
 *
 * The transformer will set `metadata.isBeanPostProcessor = true` on the
 * generated BeanDefinition, so the runtime discovers it automatically.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @PostProcessor()
 * @Singleton()
 * class LoggingPostProcessor implements BeanPostProcessor {
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
