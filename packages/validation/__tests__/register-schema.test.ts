import * as v from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { registerSchema } from '../src/schema-builder.js';
import { ValiSchemaFactory } from '../src/vali-schema-factory.js';

afterEach(() => {
  ValiSchemaFactory.resetSchemas();
});

describe('registerSchema', () => {
  it('registers a schema for a simple string field', () => {
    class SimpleDto {
      name!: string;
    }

    registerSchema(SimpleDto, [
      {
        name: 'name',
        type: { kind: 'primitive', type: 'string' },
        decorators: [],
      },
    ]);

    const schema = ValiSchemaFactory.getPrebuiltByName('SimpleDto');
    expect(schema).toBeDefined();
    expect(() => v.parse(schema!, { name: 'hello' })).not.toThrow();
    expect(() => v.parse(schema!, { name: 123 })).toThrow();
  });

  it('applies constraint decorators', () => {
    class ConstrainedDto {
      title!: string;
    }

    registerSchema(ConstrainedDto, [
      {
        name: 'title',
        type: { kind: 'primitive', type: 'string' },
        decorators: [
          { name: 'MinLength', args: { value: 3 } },
          { name: 'MaxLength', args: { value: 10 } },
        ],
      },
    ]);

    const schema = ValiSchemaFactory.getPrebuiltByName('ConstrainedDto')!;
    expect(() => v.parse(schema, { title: 'hello' })).not.toThrow();
    expect(() => v.parse(schema, { title: 'ab' })).toThrow();
    expect(() => v.parse(schema, { title: 'a'.repeat(11) })).toThrow();
  });

  it('handles optional fields', () => {
    class OptionalDto {
      name?: string;
    }

    registerSchema(OptionalDto, [
      {
        name: 'name',
        type: {
          kind: 'optional',
          inner: { kind: 'primitive', type: 'string' },
        },
        decorators: [],
      },
    ]);

    const schema = ValiSchemaFactory.getPrebuiltByName('OptionalDto')!;
    expect(() => v.parse(schema, {})).not.toThrow();
    expect(() => v.parse(schema, { name: 'hello' })).not.toThrow();
  });

  it('resolves reference fields when dependencies registered first (topological order)', () => {
    class Inner {
      value!: number;
    }
    class Outer {
      inner!: Inner;
    }

    // Register Inner BEFORE Outer — codegen topologically sorts to this order
    registerSchema(Inner, [
      {
        name: 'value',
        type: { kind: 'primitive', type: 'number' },
        decorators: [],
      },
    ]);
    registerSchema(Outer, [
      {
        name: 'inner',
        type: { kind: 'reference', className: 'Inner' },
        decorators: [],
      },
    ]);

    const schema = ValiSchemaFactory.getPrebuiltByName('Outer')!;
    expect(() => v.parse(schema, { inner: { value: 42 } })).not.toThrow();
    expect(() =>
      v.parse(schema, { inner: { value: 'not a number' } }),
    ).toThrow();
  });

  it('handles NotBlank constraint', () => {
    class BlankDto {
      name!: string;
    }

    registerSchema(BlankDto, [
      {
        name: 'name',
        type: { kind: 'primitive', type: 'string' },
        decorators: [{ name: 'NotBlank', args: {} }],
      },
    ]);

    const schema = ValiSchemaFactory.getPrebuiltByName('BlankDto')!;
    expect(() => v.parse(schema, { name: 'hello' })).not.toThrow();
    expect(() => v.parse(schema, { name: '   ' })).toThrow();
  });

  it('handles boolean union (common for @Introspected boolean fields)', () => {
    class BoolDto {
      active!: boolean;
    }

    registerSchema(BoolDto, [
      {
        name: 'active',
        type: {
          kind: 'union',
          types: [
            { kind: 'literal', value: 'false' },
            { kind: 'literal', value: 'true' },
          ],
        },
        decorators: [],
      },
    ]);

    const schema = ValiSchemaFactory.getPrebuiltByName('BoolDto')!;
    expect(() => v.parse(schema, { active: true })).not.toThrow();
    expect(() => v.parse(schema, { active: false })).not.toThrow();
    expect(() => v.parse(schema, { active: 'yes' })).toThrow();
  });
});
