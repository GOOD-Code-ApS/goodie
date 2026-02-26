import { META, pushMeta } from './metadata.js';

/**
 * Marks a method to be called after the bean is fully constructed and
 * `beforeInit` post-processors have run, but before `afterInit` post-processors.
 *
 * Only effective on `@Singleton` / `@Injectable` classes.
 *
 * @example
 * @Singleton()
 * class UserService {
 *   @PostConstruct()
 *   init() {
 *     // called after construction + beforeInit
 *   }
 * }
 */
export function PostConstruct(): MethodDecorator_Stage3 {
  return (_target, context) => {
    pushMeta(context.metadata!, META.POST_CONSTRUCT, {
      methodName: context.name,
    });
  };
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
