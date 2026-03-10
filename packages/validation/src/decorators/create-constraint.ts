/**
 * Create a custom constraint decorator.
 *
 * The validator function runs at runtime via Valibot's `v.check()`.
 * The decorator itself is a no-op — the introspection plugin records
 * `{ name, args: { validator: '<source>' } }` at build time.
 *
 * At runtime, `ValiSchemaFactory` recognizes custom constraints by name
 * and uses the provided validator function.
 *
 * @example
 * ```ts
 * const Slug = createConstraint('Slug', (value: string) => /^[a-z0-9-]+$/.test(value));
 *
 * @Introspected
 * class CreatePostDto {
 *   @Slug slug!: string;
 * }
 * ```
 */

type FieldDec = (
  target: undefined,
  context: ClassFieldDecoratorContext,
) => void;

/** Registry of custom constraint validators, keyed by constraint name. */
export const customConstraintRegistry = new Map<
  string,
  (value: unknown) => boolean
>();

export function createConstraint(
  name: string,
  validator: (value: unknown) => boolean,
): FieldDec {
  customConstraintRegistry.set(name, validator);
  return (_target, _context) => {
    // No-op: metadata extracted at compile time by introspection plugin
  };
}
