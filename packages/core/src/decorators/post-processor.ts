import { META, setMeta } from './metadata.js';

/**
 * Marks a singleton bean as a BeanPostProcessor.
 *
 * The transformer will set `metadata.isBeanPostProcessor = true` on the
 * generated BeanDefinition, so the runtime discovers it automatically.
 *
 * @example
 * @PostProcessor()
 * @Singleton()
 * class LoggingPostProcessor implements BeanPostProcessor {
 *   afterInit(bean: unknown) { console.log('created', bean); return bean; }
 * }
 */
export function PostProcessor(): ClassDecorator_Stage3 {
  return (_target, context) => {
    setMeta(context.metadata!, META.POST_PROCESSOR, true);
  };
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
