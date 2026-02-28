/**
 * Metadata helpers for Stage 3 decorators.
 *
 * Stage 3 decorators provide `context.metadata` — an object that gets
 * attached to the class via `Symbol.metadata`. We use well-known keys
 * (Symbols) to avoid collisions with user metadata.
 */

/** Well-known metadata keys used by goodie decorators. */
export const META = {
  SCOPE: Symbol('goodie:scope'),
  NAME: Symbol('goodie:name'),
  EAGER: Symbol('goodie:eager'),
  MODULE: Symbol('goodie:module'),
  PROVIDES: Symbol('goodie:provides'),
  INJECT: Symbol('goodie:inject'),
  OPTIONAL: Symbol('goodie:optional'),
  PRE_DESTROY: Symbol('goodie:pre-destroy'),
  POST_CONSTRUCT: Symbol('goodie:post-construct'),
  POST_PROCESSOR: Symbol('goodie:post-processor'),
  VALUE: Symbol('goodie:value'),
} as const;

type MetadataObject = DecoratorMetadataObject | Record<PropertyKey, unknown>;

/**
 * Set a single metadata value on the decorator context metadata object.
 */
export function setMeta(
  metadata: MetadataObject,
  key: symbol,
  value: unknown,
): void {
  metadata[key] = value;
}

/**
 * Push a value onto an array stored under `key`. Creates the array if needed.
 */
export function pushMeta(
  metadata: MetadataObject,
  key: symbol,
  value: unknown,
): void {
  const arr = (metadata[key] as unknown[]) ?? [];
  arr.push(value);
  metadata[key] = arr;
}

/**
 * Read the metadata object stashed on a class by Stage 3 decorators.
 * Returns `undefined` if no decorators have run on the class.
 */
export function getClassMetadata(
  cls: abstract new (...args: any[]) => any,
): Record<PropertyKey, unknown> | undefined {
  return (
    cls as unknown as { [Symbol.metadata]?: Record<PropertyKey, unknown> }
  )[Symbol.metadata];
}
