import { describe, expect, it } from 'vitest';
import { RuntimeBindings } from '../src/runtime-bindings.js';

describe('RuntimeBindings', () => {
  it('makes bindings available inside run()', () => {
    const result = RuntimeBindings.run({ DB: 'my-database' }, () => {
      return RuntimeBindings.get<string>('DB');
    });
    expect(result).toBe('my-database');
  });

  it('throws when get() is called outside run()', () => {
    expect(() => RuntimeBindings.get('DB')).toThrow(
      /no bindings available in current context/,
    );
  });

  it('throws when binding key is not found', () => {
    RuntimeBindings.run({ OTHER: 'value' }, () => {
      expect(() => RuntimeBindings.get('DB')).toThrow(/binding 'DB' not found/);
    });
  });

  it('isAvailable() returns false outside run()', () => {
    expect(RuntimeBindings.isAvailable()).toBe(false);
  });

  it('isAvailable() returns true inside run()', () => {
    RuntimeBindings.run({}, () => {
      expect(RuntimeBindings.isAvailable()).toBe(true);
    });
  });

  it('supports async functions inside run()', async () => {
    const result = await RuntimeBindings.run({ KEY: 42 }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return RuntimeBindings.get<number>('KEY');
    });
    expect(result).toBe(42);
  });
});
