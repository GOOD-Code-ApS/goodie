import type { DecoratorMeta, FieldType } from '@goodie-ts/core';
import { schemaFromFieldDescriptors } from './schema-from-descriptors.js';
import { ValiSchemaFactory } from './vali-schema-factory.js';

/**
 * Register a Valibot schema for a type from plain field descriptors.
 *
 * Generated `schemas.ts` calls this with FieldType trees + constraint
 * metadata. The function maps these to Valibot schemas internally —
 * generated code never touches the Valibot API.
 *
 * Schemas are composable: `reference` field types resolve the target
 * type's schema from the registry. The codegen topologically sorts
 * registrations so dependencies are always registered first.
 *
 * @param type - The class constructor (used as registry key)
 * @param fields - Array of field descriptors with type tree + constraint metadata
 */
export function registerSchema(
  type: new (...args: any[]) => unknown,
  fields: ReadonlyArray<{
    name: string;
    type: FieldType;
    decorators: DecoratorMeta[];
  }>,
): void {
  const schema = schemaFromFieldDescriptors(fields);
  ValiSchemaFactory.registerSchema(type, schema);
}
