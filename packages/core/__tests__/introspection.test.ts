import { describe, expect, it } from 'vitest';
import type { TypeMetadata } from '../src/introspection.js';
import { MetadataRegistry } from '../src/introspection.js';

class TestDto {
  name!: string;
}

class OtherDto {
  value!: number;
}

const testMetadata: TypeMetadata<TestDto> = {
  type: TestDto,
  className: 'TestDto',
  fields: [
    {
      name: 'name',
      type: { kind: 'primitive', type: 'string' },
      decorators: [],
    },
  ],
};

const otherMetadata: TypeMetadata<OtherDto> = {
  type: OtherDto,
  className: 'OtherDto',
  fields: [
    {
      name: 'value',
      type: { kind: 'primitive', type: 'number' },
      decorators: [{ name: 'Min', args: { value: 0 } }],
    },
  ],
};

describe('MetadataRegistry', () => {
  it('registers and retrieves metadata by class constructor', () => {
    const registry = new MetadataRegistry();
    registry.register(testMetadata);

    const result = registry.get(TestDto);
    expect(result).toBe(testMetadata);
    expect(result?.className).toBe('TestDto');
    expect(result?.fields).toHaveLength(1);
  });

  it('returns undefined for unregistered classes', () => {
    const registry = new MetadataRegistry();

    expect(registry.get(TestDto)).toBeUndefined();
  });

  it('checks existence with has()', () => {
    const registry = new MetadataRegistry();
    registry.register(testMetadata);

    expect(registry.has(TestDto)).toBe(true);
    expect(registry.has(OtherDto)).toBe(false);
  });

  it('returns all registered entries', () => {
    const registry = new MetadataRegistry();
    registry.register(testMetadata);
    registry.register(otherMetadata);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(testMetadata);
    expect(all).toContain(otherMetadata);
  });

  it('preserves decorator metadata on fields', () => {
    const registry = new MetadataRegistry();
    registry.register(otherMetadata);

    const result = registry.get(OtherDto);
    expect(result?.fields[0].decorators).toEqual([
      { name: 'Min', args: { value: 0 } },
    ]);
  });
});
