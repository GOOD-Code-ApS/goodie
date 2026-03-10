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
  private readonly cache = new Map<
    new (
      ...args: any[]
    ) => unknown,
    GenericSchema
  >();

  /**
   * Get or build a Valibot schema for the given class constructor.
   * Returns `undefined` if the type is not in `MetadataRegistry`.
   */
  getSchema(type: new (...args: any[]) => unknown): GenericSchema | undefined {
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
      let schema = this.fieldTypeToVali(field.type);
      schema = this.applyConstraints(schema, field.decorators);
      fields[field.name] = schema;
    }

    const objectSchema = v.object(fields);
    this.cache.set(type, objectSchema as GenericSchema);
    return objectSchema as GenericSchema;
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
        return this.referenceToVali(type.className);
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

  private referenceToVali(className: string): GenericSchema {
    // Look up by className in registry
    const allMetadata = MetadataRegistry.INSTANCE.getAll();
    const metadata = allMetadata.find((m) => m.className === className);
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
      const action = this.constraintToAction(dec);
      if (action) actions.push(action);
    }

    if (actions.length === 0) return schema;
    return v.pipe(schema, ...actions) as GenericSchema;
  }

  private constraintToAction(
    dec: DecoratorMeta,
  ): v.GenericValidation | undefined {
    const val = dec.args.value;

    switch (dec.name) {
      case 'MinLength':
        return v.minLength(val as number);
      case 'MaxLength':
        return v.maxLength(val as number);
      case 'Min':
        return v.minValue(val as number);
      case 'Max':
        return v.maxValue(val as number);
      case 'Pattern':
        return v.regex(new RegExp(val as string));
      case 'NotBlank':
        return v.minLength(1);
      case 'Email':
        return v.email();
      case 'Size': {
        const min = val as number;
        const max = dec.args.value2 as number;
        return v.length(min, max);
      }
      default: {
        // Check custom constraint registry
        const validator = customConstraintRegistry.get(dec.name);
        if (validator) {
          return v.check(validator, `Custom constraint '${dec.name}' failed`);
        }
        return undefined;
      }
    }
  }
}
