import { describe, expect, it } from 'vitest';
import { MDC } from '../src/mdc.js';

describe('MDC', () => {
  it('should store and retrieve values within a context', () => {
    const context = new Map([['traceId', 'abc-123']]);

    MDC.run(context, () => {
      expect(MDC.get('traceId')).toBe('abc-123');
    });
  });

  it('should return undefined outside of a context', () => {
    expect(MDC.get('traceId')).toBeUndefined();
  });

  it('should allow putting new values into the context', () => {
    const context = new Map<string, string>();

    MDC.run(context, () => {
      MDC.put('userId', 'user-42');
      expect(MDC.get('userId')).toBe('user-42');
    });
  });

  it('should return all entries via getAll()', () => {
    const context = new Map([
      ['traceId', 'abc'],
      ['userId', '42'],
    ]);

    MDC.run(context, () => {
      expect(MDC.getAll()).toEqual({ traceId: 'abc', userId: '42' });
    });
  });

  it('should return empty object from getAll() outside of a context', () => {
    expect(MDC.getAll()).toEqual({});
  });

  it('should remove a value from the context', () => {
    const context = new Map([['key', 'value']]);

    MDC.run(context, () => {
      MDC.remove('key');
      expect(MDC.get('key')).toBeUndefined();
    });
  });

  it('should clear all values from the context', () => {
    const context = new Map([
      ['a', '1'],
      ['b', '2'],
    ]);

    MDC.run(context, () => {
      MDC.clear();
      expect(MDC.getAll()).toEqual({});
    });
  });

  it('should propagate context through async operations', async () => {
    const context = new Map([['traceId', 'async-trace']]);

    await MDC.run(context, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(MDC.get('traceId')).toBe('async-trace');
    });
  });

  it('should isolate contexts between concurrent runs', async () => {
    const results: string[] = [];

    const run1 = MDC.run(new Map([['id', 'run1']]), async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      results.push(MDC.get('id')!);
    });

    const run2 = MDC.run(new Map([['id', 'run2']]), async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(MDC.get('id')!);
    });

    await Promise.all([run1, run2]);
    expect(results).toContain('run1');
    expect(results).toContain('run2');
  });
});
