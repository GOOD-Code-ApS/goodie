/**
 * Marks a class for compile-time introspection metadata generation.
 *
 * **Compile-time only** — the decorator is a no-op marker at runtime.
 * The transformer reads this decorator via AST inspection at build time
 * and generates a `BeanIntrospection` with field/type/constraint metadata.
 *
 * `@Introspected` classes are NOT beans — they are value objects (DTOs,
 * request/response types) whose shape is needed at runtime by validation,
 * OpenAPI, and serialization.
 *
 * @param options.classes - Register third-party classes for introspection
 *   (shape-only metadata, no constraint decorators).
 *
 * @example
 * @Introspected()
 * class CreateTodoRequest {
 *   title!: string
 *   description?: string
 * }
 *
 * @example
 * // Third-party types
 * @Introspected({ classes: [ExternalDto] })
 * class AppModule { ... }
 */
export function Introspected(
  _options?: IntrospectedOptions,
): ClassDecorator_Stage3 {
  return () => {};
}

export interface IntrospectedOptions {
  /** Third-party classes to generate shape-only introspection for. */
  classes?: Array<new (...args: any[]) => any>;
}

type ClassDecorator_Stage3 = (
  target: new (...args: any[]) => any,
  context: ClassDecoratorContext,
) => void;
