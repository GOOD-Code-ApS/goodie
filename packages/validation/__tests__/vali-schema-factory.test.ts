import { MetadataRegistry } from '@goodie-ts/core';
import * as v from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { ValiSchemaFactory } from '../src/vali-schema-factory.js';

class SimpleDto {
  name!: string;
  age!: number;
}

class Address {
  street!: string;
  city!: string;
}

class PersonDto {
  name!: string;
  address!: Address;
}

class WithArray {
  tags!: string[];
}

class WithOptional {
  nickname?: string;
}

class WithConstraints {
  title!: string;
  count!: number;
}

class WithStatus {
  status!: 'active' | 'inactive';
}

afterEach(() => {
  MetadataRegistry.INSTANCE.reset();
});

function createFactory(): ValiSchemaFactory {
  return new (ValiSchemaFactory as any)();
}

describe('ValiSchemaFactory', () => {
  it('returns undefined for types not in MetadataRegistry', () => {
    const factory = createFactory();
    expect(factory.getSchema(SimpleDto)).toBeUndefined();
  });

  it('builds schema for simple primitive fields', () => {
    MetadataRegistry.INSTANCE.register({
      type: SimpleDto,
      className: 'SimpleDto',
      fields: [
        {
          name: 'name',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'age',
          type: { kind: 'primitive', type: 'number' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(SimpleDto)!;
    expect(schema).toBeDefined();

    const result = v.safeParse(schema, { name: 'Alice', age: 30 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid primitive types', () => {
    MetadataRegistry.INSTANCE.register({
      type: SimpleDto,
      className: 'SimpleDto',
      fields: [
        {
          name: 'name',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'age',
          type: { kind: 'primitive', type: 'number' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(SimpleDto)!;

    const result = v.safeParse(schema, { name: 123, age: 'not a number' });
    expect(result.success).toBe(false);
  });

  it('handles nested @Introspected references', () => {
    MetadataRegistry.INSTANCE.register({
      type: Address,
      className: 'Address',
      fields: [
        {
          name: 'street',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'city',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
      ],
    });
    MetadataRegistry.INSTANCE.register({
      type: PersonDto,
      className: 'PersonDto',
      fields: [
        {
          name: 'name',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'address',
          type: { kind: 'reference', className: 'Address' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(PersonDto)!;

    const valid = v.safeParse(schema, {
      name: 'Alice',
      address: { street: '123 Main St', city: 'Springfield' },
    });
    expect(valid.success).toBe(true);

    const invalid = v.safeParse(schema, {
      name: 'Alice',
      address: { street: 123, city: 'Springfield' },
    });
    expect(invalid.success).toBe(false);
  });

  it('treats non-introspected references as v.unknown()', () => {
    MetadataRegistry.INSTANCE.register({
      type: PersonDto,
      className: 'PersonDto',
      fields: [
        {
          name: 'name',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'address',
          type: { kind: 'reference', className: 'UnknownType' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(PersonDto)!;

    // address can be anything — not validated
    const result = v.safeParse(schema, { name: 'Alice', address: 42 });
    expect(result.success).toBe(true);
  });

  it('handles array fields', () => {
    MetadataRegistry.INSTANCE.register({
      type: WithArray,
      className: 'WithArray',
      fields: [
        {
          name: 'tags',
          type: {
            kind: 'array',
            elementType: { kind: 'primitive', type: 'string' },
          },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithArray)!;

    expect(v.safeParse(schema, { tags: ['a', 'b'] }).success).toBe(true);
    expect(v.safeParse(schema, { tags: [1, 2] }).success).toBe(false);
  });

  it('handles optional fields', () => {
    MetadataRegistry.INSTANCE.register({
      type: WithOptional,
      className: 'WithOptional',
      fields: [
        {
          name: 'nickname',
          type: {
            kind: 'optional',
            inner: { kind: 'primitive', type: 'string' },
          },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithOptional)!;

    expect(v.safeParse(schema, { nickname: 'Nick' }).success).toBe(true);
    expect(v.safeParse(schema, {}).success).toBe(true);
    expect(v.safeParse(schema, { nickname: 123 }).success).toBe(false);
  });

  it('handles literal union fields', () => {
    MetadataRegistry.INSTANCE.register({
      type: WithStatus,
      className: 'WithStatus',
      fields: [
        {
          name: 'status',
          type: {
            kind: 'union',
            types: [
              { kind: 'literal', value: '"active"' },
              { kind: 'literal', value: '"inactive"' },
            ],
          },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithStatus)!;

    expect(v.safeParse(schema, { status: 'active' }).success).toBe(true);
    expect(v.safeParse(schema, { status: 'inactive' }).success).toBe(true);
    expect(v.safeParse(schema, { status: 'deleted' }).success).toBe(false);
  });

  it('applies MinLength constraint', () => {
    MetadataRegistry.INSTANCE.register({
      type: WithConstraints,
      className: 'WithConstraints',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'MinLength', args: { value: 3 } }],
        },
        {
          name: 'count',
          type: { kind: 'primitive', type: 'number' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithConstraints)!;

    expect(v.safeParse(schema, { title: 'abc', count: 1 }).success).toBe(true);
    expect(v.safeParse(schema, { title: 'ab', count: 1 }).success).toBe(false);
  });

  it('applies MaxLength constraint', () => {
    MetadataRegistry.INSTANCE.register({
      type: WithConstraints,
      className: 'WithConstraints',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'MaxLength', args: { value: 5 } }],
        },
        {
          name: 'count',
          type: { kind: 'primitive', type: 'number' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithConstraints)!;

    expect(v.safeParse(schema, { title: '12345', count: 0 }).success).toBe(
      true,
    );
    expect(v.safeParse(schema, { title: '123456', count: 0 }).success).toBe(
      false,
    );
  });

  it('applies Min and Max constraints', () => {
    MetadataRegistry.INSTANCE.register({
      type: WithConstraints,
      className: 'WithConstraints',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'count',
          type: { kind: 'primitive', type: 'number' },
          decorators: [
            { name: 'Min', args: { value: 1 } },
            { name: 'Max', args: { value: 100 } },
          ],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithConstraints)!;

    expect(v.safeParse(schema, { title: 'x', count: 50 }).success).toBe(true);
    expect(v.safeParse(schema, { title: 'x', count: 0 }).success).toBe(false);
    expect(v.safeParse(schema, { title: 'x', count: 101 }).success).toBe(false);
  });

  it('applies Email constraint', () => {
    MetadataRegistry.INSTANCE.register({
      type: SimpleDto,
      className: 'SimpleDto',
      fields: [
        {
          name: 'name',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'Email', args: {} }],
        },
        {
          name: 'age',
          type: { kind: 'primitive', type: 'number' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(SimpleDto)!;

    expect(
      v.safeParse(schema, { name: 'test@example.com', age: 1 }).success,
    ).toBe(true);
    expect(v.safeParse(schema, { name: 'not-an-email', age: 1 }).success).toBe(
      false,
    );
  });

  it('applies Pattern constraint', () => {
    MetadataRegistry.INSTANCE.register({
      type: SimpleDto,
      className: 'SimpleDto',
      fields: [
        {
          name: 'name',
          type: { kind: 'primitive', type: 'string' },
          decorators: [{ name: 'Pattern', args: { value: '^[a-z]+$' } }],
        },
        {
          name: 'age',
          type: { kind: 'primitive', type: 'number' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(SimpleDto)!;

    expect(v.safeParse(schema, { name: 'abc', age: 1 }).success).toBe(true);
    expect(v.safeParse(schema, { name: 'ABC', age: 1 }).success).toBe(false);
  });

  it('applies multiple constraints on same field', () => {
    MetadataRegistry.INSTANCE.register({
      type: WithConstraints,
      className: 'WithConstraints',
      fields: [
        {
          name: 'title',
          type: { kind: 'primitive', type: 'string' },
          decorators: [
            { name: 'MinLength', args: { value: 2 } },
            { name: 'MaxLength', args: { value: 10 } },
          ],
        },
        {
          name: 'count',
          type: { kind: 'primitive', type: 'number' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithConstraints)!;

    expect(v.safeParse(schema, { title: 'ok', count: 0 }).success).toBe(true);
    expect(v.safeParse(schema, { title: 'a', count: 0 }).success).toBe(false);
    expect(
      v.safeParse(schema, { title: '12345678901', count: 0 }).success,
    ).toBe(false);
  });

  it('caches schemas across multiple getSchema calls', () => {
    MetadataRegistry.INSTANCE.register({
      type: SimpleDto,
      className: 'SimpleDto',
      fields: [
        {
          name: 'name',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'age',
          type: { kind: 'primitive', type: 'number' },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema1 = factory.getSchema(SimpleDto);
    const schema2 = factory.getSchema(SimpleDto);

    expect(schema1).toBe(schema2);
  });

  it('handles nullable fields', () => {
    class WithNullable {
      value!: string | null;
    }

    MetadataRegistry.INSTANCE.register({
      type: WithNullable,
      className: 'WithNullable',
      fields: [
        {
          name: 'value',
          type: {
            kind: 'nullable',
            inner: { kind: 'primitive', type: 'string' },
          },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithNullable)!;

    expect(v.safeParse(schema, { value: 'hello' }).success).toBe(true);
    expect(v.safeParse(schema, { value: null }).success).toBe(true);
    expect(v.safeParse(schema, { value: 123 }).success).toBe(false);
  });

  it('handles arrays of nested references', () => {
    MetadataRegistry.INSTANCE.register({
      type: Address,
      className: 'Address',
      fields: [
        {
          name: 'street',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
        {
          name: 'city',
          type: { kind: 'primitive', type: 'string' },
          decorators: [],
        },
      ],
    });

    class WithAddresses {
      addresses!: Address[];
    }

    MetadataRegistry.INSTANCE.register({
      type: WithAddresses,
      className: 'WithAddresses',
      fields: [
        {
          name: 'addresses',
          type: {
            kind: 'array',
            elementType: { kind: 'reference', className: 'Address' },
          },
          decorators: [],
        },
      ],
    });

    const factory = createFactory();
    const schema = factory.getSchema(WithAddresses)!;

    expect(
      v.safeParse(schema, {
        addresses: [
          { street: '1st', city: 'A' },
          { street: '2nd', city: 'B' },
        ],
      }).success,
    ).toBe(true);

    expect(
      v.safeParse(schema, {
        addresses: [{ street: 123, city: 'A' }],
      }).success,
    ).toBe(false);
  });
});
