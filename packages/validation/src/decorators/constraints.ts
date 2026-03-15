/**
 * Constraint decorators for field-level validation.
 *
 * These are no-ops at runtime — the introspection plugin scans them at
 * build time and stores them as `DecoratorMeta` on the field's metadata.
 * At runtime, `ValiSchemaFactory` reads the metadata and builds
 * Valibot schemas from it.
 */

type FieldDec = (
  target: undefined,
  context: ClassFieldDecoratorContext,
) => void;

function constraintDecorator(): FieldDec {
  return (_target, _context) => {
    // No-op: metadata extracted at compile time by introspection plugin
  };
}

/** Minimum string length. */
export function MinLength(_value: number): FieldDec {
  return constraintDecorator();
}

/** Maximum string length. */
export function MaxLength(_value: number): FieldDec {
  return constraintDecorator();
}

/** Minimum numeric value (inclusive). */
export function Min(_value: number): FieldDec {
  return constraintDecorator();
}

/** Maximum numeric value (inclusive). */
export function Max(_value: number): FieldDec {
  return constraintDecorator();
}

/** String must match the given regex pattern. */
export function Pattern(_pattern: string): FieldDec {
  return constraintDecorator();
}

/** String must not be blank (empty or whitespace-only). */
export function NotBlank(): FieldDec {
  return constraintDecorator();
}

/** String must be a valid email address. */
export function Email(): FieldDec {
  return constraintDecorator();
}

/** Array or string length must be between min and max (inclusive). */
export function Size(_min: number, _max: number): FieldDec {
  return constraintDecorator();
}
