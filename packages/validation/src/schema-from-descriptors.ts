import type { DecoratorMeta, FieldType } from '@goodie-ts/core';
import type { BaseSchema, GenericSchema, GenericValidation } from 'valibot';
import * as v from 'valibot';
import { constraintToActions } from './constraint-actions.js';
import { ValiSchemaFactory } from './vali-schema-factory.js';

/**
 * Build a Valibot object schema from an array of field descriptors.
 *
 * Handles composability: `reference` fields look up the target type's
 * pre-registered schema from `ValiSchemaFactory`. The codegen topologically
 * sorts registrations so referenced types are always registered first.
 * If a target is not registered, falls back to `v.unknown()` (validation is opt-in).
 */
export function schemaFromFieldDescriptors(
  fields: ReadonlyArray<{
    name: string;
    type: FieldType;
    decorators: DecoratorMeta[];
  }>,
): GenericSchema {
  const schemaFields: Record<string, GenericSchema> = {};
  for (const field of fields) {
    schemaFields[field.name] = buildFieldSchema(field.type, field.decorators);
  }
  return v.object(schemaFields) as GenericSchema;
}

function buildFieldSchema(
  type: FieldType,
  decorators: DecoratorMeta[],
): GenericSchema {
  if (type.kind === 'optional') {
    const inner = applyConstraints(fieldTypeToVali(type.inner), decorators);
    return v.optional(inner) as GenericSchema;
  }
  if (type.kind === 'nullable') {
    const inner = applyConstraints(fieldTypeToVali(type.inner), decorators);
    return v.nullable(inner) as GenericSchema;
  }
  return applyConstraints(fieldTypeToVali(type), decorators);
}

function fieldTypeToVali(type: FieldType): GenericSchema {
  switch (type.kind) {
    case 'primitive':
      return primitiveToVali(type.type);
    case 'literal':
      return literalToVali(type.value);
    case 'array':
      return v.array(fieldTypeToVali(type.elementType)) as GenericSchema;
    case 'reference':
      return referenceToVali(type.className);
    case 'union':
      return unionToVali(type.types);
    case 'optional':
      return v.optional(fieldTypeToVali(type.inner)) as GenericSchema;
    case 'nullable':
      return v.nullable(fieldTypeToVali(type.inner)) as GenericSchema;
  }
}

function primitiveToVali(typeName: string): GenericSchema {
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

function literalToVali(value: string): GenericSchema {
  if (value.startsWith('"') && value.endsWith('"')) {
    return v.literal(value.slice(1, -1)) as GenericSchema;
  }
  if (value === 'true') return v.literal(true) as GenericSchema;
  if (value === 'false') return v.literal(false) as GenericSchema;
  const num = Number(value);
  if (!Number.isNaN(num)) return v.literal(num) as GenericSchema;
  return v.unknown() as GenericSchema;
}

function referenceToVali(className: string): GenericSchema {
  // Direct lookup — the codegen topologically sorts registrations so
  // referenced types are always registered before the types that reference them.
  const schema = ValiSchemaFactory.getPrebuiltByName(className);
  return schema ?? (v.unknown() as GenericSchema);
}

function unionToVali(members: FieldType[]): GenericSchema {
  if (members.length === 0) return v.unknown() as GenericSchema;
  if (members.length === 1) return fieldTypeToVali(members[0]);
  return v.union(
    members.map((m) => fieldTypeToVali(m)) as [
      BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
      BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
      ...BaseSchema<unknown, unknown, v.BaseIssue<unknown>>[],
    ],
  ) as GenericSchema;
}

function applyConstraints(
  schema: GenericSchema,
  decorators: DecoratorMeta[],
): GenericSchema {
  if (decorators.length === 0) return schema;

  const actions: GenericValidation[] = [];
  for (const dec of decorators) {
    const result = constraintToActions(dec);
    if (result) actions.push(...result);
  }

  if (actions.length === 0) return schema;
  return v.pipe(schema, ...actions) as GenericSchema;
}
