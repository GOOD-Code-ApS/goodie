import type { DecoratorMeta, FieldType, TypeMetadata } from '@goodie-ts/core';
import { MetadataRegistry, Singleton } from '@goodie-ts/core';
import type { BaseSchema, GenericSchema } from 'valibot';
import * as v from 'valibot';
import { customConstraintRegistry } from './decorators/create-constraint.js';

/**
 * Builds and caches Valibot schemas from `TypeMetadata` (compile-time introspection).
 *
 * Reads from `MetadataRegistry.INSTANCE` — schemas are built lazily on first
 * access and cached per class constructor. Recursive: handles nested
 * `@Introspected` types via the `reference` FieldType.
 *
 * Types not in `MetadataRegistry` (not `@Introspected`) are treated as
 * `v.unknown()` — validation is opt-in, not an error.
 */
@Singleton()
export class ValiSchemaFactory {
  /**
   * Static registry for compile-time pre-built schemas.
   * Populated by generated `schemas.ts` at module load time (before DI resolves).
   * Instance `getSchema()` checks this before falling back to lazy building.
   */
  private static readonly prebuilt = new Map<
    new (
      ...args: any[]
    ) => unknown,
    GenericSchema
  >();

  /**
   * Register a pre-built Valibot schema for a type.
   * Called from generated `schemas.ts` at module load time.
   */
  static registerSchema(
    type: new (...args: any[]) => unknown,
    schema: GenericSchema,
  ): void {
    ValiSchemaFactory.prebuilt.set(type, schema);
  }

  /** Reset the static schema registry. For testing only. */
  static resetSchemas(): void {
    ValiSchemaFactory.prebuilt.clear();
  }

  private readonly cache = new Map<
    new (
      ...args: any[]
    ) => unknown,
    GenericSchema
  >();

  /** Clear the instance schema cache. Useful in tests after `MetadataRegistry.reset()`. */
  clearCache(): void {
    this.cache.clear();
    this.metadataByImportPath = undefined;
    this.metadataByName = undefined;
  }

  /**
   * Get or build a Valibot schema for the given class constructor.
   * Checks pre-built schemas first, then instance cache, then lazy-builds.
   * Returns `undefined` if the type is not in `MetadataRegistry`.
   */
  getSchema(type: new (...args: any[]) => unknown): GenericSchema | undefined {
    // Pre-built from compile-time generated schemas.ts
    const prebuilt = ValiSchemaFactory.prebuilt.get(type);
    if (prebuilt) return prebuilt;

    const cached = this.cache.get(type);
    if (cached) return cached;

    const metadata = MetadataRegistry.INSTANCE.get(type);
    if (!metadata) return undefined;

    return this.buildAndCache(type, metadata);
  }

  private buildAndCache(
    type: new (...args: any[]) => unknown,
    metadata: TypeMetadata,
  ): GenericSchema {
    // Insert a placeholder to handle circular references
    const placeholder = v.lazy(() => {
      const real = this.cache.get(type);
      return real ?? v.unknown();
    });
    this.cache.set(type, placeholder as GenericSchema);

    const fields: Record<string, GenericSchema> = {};
    for (const field of metadata.fields) {
      fields[field.name] = this.buildFieldSchema(field.type, field.decorators);
    }

    const objectSchema = v.object(fields);
    this.cache.set(type, objectSchema as GenericSchema);
    return objectSchema as GenericSchema;
  }

  /**
   * Build the complete schema for a field, applying constraints to the inner
   * type BEFORE wrapping with optional/nullable.
   */
  private buildFieldSchema(
    type: FieldType,
    decorators: DecoratorMeta[],
  ): GenericSchema {
    if (type.kind === 'optional') {
      const inner = this.applyConstraints(
        this.fieldTypeToVali(type.inner),
        decorators,
      );
      return v.optional(inner) as GenericSchema;
    }
    if (type.kind === 'nullable') {
      const inner = this.applyConstraints(
        this.fieldTypeToVali(type.inner),
        decorators,
      );
      return v.nullable(inner) as GenericSchema;
    }
    return this.applyConstraints(this.fieldTypeToVali(type), decorators);
  }

  private fieldTypeToVali(type: FieldType): GenericSchema {
    switch (type.kind) {
      case 'primitive':
        return this.primitiveToVali(type.type);
      case 'literal':
        return this.literalToVali(type.value);
      case 'array':
        return v.array(this.fieldTypeToVali(type.elementType)) as GenericSchema;
      case 'reference':
        return this.referenceToVali(type.className, type.importPath);
      case 'union':
        return this.unionToVali(type.types);
      case 'optional':
        return v.optional(this.fieldTypeToVali(type.inner)) as GenericSchema;
      case 'nullable':
        return v.nullable(this.fieldTypeToVali(type.inner)) as GenericSchema;
    }
  }

  private primitiveToVali(typeName: string): GenericSchema {
    switch (typeName) {
      case 'string':
        return v.string() as GenericSchema;
      case 'number':
        return v.number() as GenericSchema;
      case 'boolean':
        return v.boolean() as GenericSchema;
      default:
        return v.unknown() as GenericSchema;
    }
  }

  private literalToVali(value: string): GenericSchema {
    // Literal values stored as strings: '"active"', '42', 'true'
    if (value.startsWith('"') && value.endsWith('"')) {
      return v.literal(value.slice(1, -1)) as GenericSchema;
    }
    if (value === 'true') return v.literal(true) as GenericSchema;
    if (value === 'false') return v.literal(false) as GenericSchema;
    const num = Number(value);
    if (!Number.isNaN(num)) return v.literal(num) as GenericSchema;
    return v.unknown() as GenericSchema;
  }

  /** Lazily-built lookup maps for metadata by importPath and by className. */
  private metadataByImportPath: Map<string, TypeMetadata> | undefined;
  private metadataByName: Map<string, TypeMetadata> | undefined;

  private buildMetadataLookups(): void {
    this.metadataByImportPath = new Map();
    this.metadataByName = new Map();
    for (const m of MetadataRegistry.INSTANCE.getAll()) {
      if (m.importPath) {
        this.metadataByImportPath.set(m.importPath, m);
      }
      // First-wins for className — importPath lookup is preferred when available
      if (!this.metadataByName.has(m.className)) {
        this.metadataByName.set(m.className, m);
      }
    }
  }

  private referenceToVali(
    className: string,
    importPath?: string,
  ): GenericSchema {
    if (!this.metadataByName) this.buildMetadataLookups();

    // Prefer exact match by importPath (disambiguates same-named classes)
    const metadata =
      (importPath && this.metadataByImportPath!.get(importPath)) ||
      this.metadataByName!.get(className);
    if (!metadata) return v.unknown() as GenericSchema;
    return this.getSchema(metadata.type) ?? (v.unknown() as GenericSchema);
  }

  private unionToVali(members: FieldType[]): GenericSchema {
    if (members.length === 0) return v.unknown() as GenericSchema;
    if (members.length === 1) return this.fieldTypeToVali(members[0]);
    return v.union(
      members.map((m) => this.fieldTypeToVali(m)) as [
        BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
        BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
        ...BaseSchema<unknown, unknown, v.BaseIssue<unknown>>[],
      ],
    ) as GenericSchema;
  }

  private applyConstraints(
    schema: GenericSchema,
    decorators: DecoratorMeta[],
  ): GenericSchema {
    if (decorators.length === 0) return schema;

    const actions: v.GenericValidation[] = [];

    for (const dec of decorators) {
      const result = this.constraintToActions(dec);
      if (result) actions.push(...result);
    }

    if (actions.length === 0) return schema;
    return v.pipe(schema, ...actions) as GenericSchema;
  }

  private constraintToActions(
    dec: DecoratorMeta,
  ): v.GenericValidation[] | undefined {
    const val = dec.args.value;

    switch (dec.name) {
      case 'MinLength':
        return [v.minLength(val as number)];
      case 'MaxLength':
        return [v.maxLength(val as number)];
      case 'Min':
        return [v.minValue(val as number)];
      case 'Max':
        return [v.maxValue(val as number)];
      case 'Pattern':
        return [v.regex(new RegExp(val as string))];
      case 'NotBlank':
        return [
          v.check((s: string) => s.trim().length > 0, 'Must not be blank'),
        ];
      case 'Email':
        return [v.email()];
      case 'Size': {
        const min = val as number;
        const max = dec.args.value2 as number;
        return [v.minLength(min), v.maxLength(max)];
      }
      default: {
        // Check custom constraint registry
        const validator = customConstraintRegistry.get(dec.name);
        if (validator) {
          return [v.check(validator, `Custom constraint '${dec.name}' failed`)];
        }
        return undefined;
      }
    }
  }
}
