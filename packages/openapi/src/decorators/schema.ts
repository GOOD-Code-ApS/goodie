/**
 * `@Schema` decorator for custom OpenAPI metadata on `@Introspected` fields.
 *
 * No-op at runtime — the introspection plugin scans it at build time and
 * stores it as `DecoratorMeta { name: 'Schema', args: { ... } }`.
 * At runtime, `OpenApiSpecBuilder` reads the metadata and applies it
 * to the generated OpenAPI schema.
 *
 * @example
 * ```typescript
 * @Introspected()
 * class CreateTodoDto {
 *   @Schema({ description: 'The title of the todo item', example: 'Buy milk' })
 *   @NotBlank()
 *   accessor title: string;
 * }
 * ```
 */

type FieldDec = (
  target: undefined,
  context: ClassFieldDecoratorContext,
) => void;

export interface SchemaOptions {
  /** Human-readable description of the field. */
  description?: string;
  /** Example value for documentation. */
  example?: unknown;
  /** OpenAPI format hint (e.g. 'email', 'uri', 'date-time', 'uuid'). */
  format?: string;
  /** Mark the field as deprecated. */
  deprecated?: boolean;
  /** Default value. */
  default?: unknown;
  /** Restrict to a fixed set of allowed values. */
  enum?: unknown[];
  /** Mark the field as read-only. */
  readOnly?: boolean;
  /** Mark the field as write-only. */
  writeOnly?: boolean;
}

export function Schema(_options: SchemaOptions): FieldDec {
  return (_target, _context) => {
    // No-op: metadata extracted at compile time by introspection plugin
  };
}
