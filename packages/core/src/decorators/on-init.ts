/**
 * Marks a method to be called after the component is fully constructed and
 * `beforeInit` post-processors have run, but before `afterInit` post-processors.
 *
 * Only effective on `@Singleton` / `@Transient` classes.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time.
 *
 * @example
 * @Singleton()
 * class UserService {
 *   @OnInit()
 *   init() {
 *     // called after construction + beforeInit
 *   }
 * }
 */
export function OnInit(): MethodDecorator_Stage3 {
  return () => {};
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;
