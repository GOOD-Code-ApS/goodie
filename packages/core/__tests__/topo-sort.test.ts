import { describe, expect, it } from 'vitest';
import type { BeanDefinition } from '../src/bean-definition.js';
import { CircularDependencyError } from '../src/errors.js';
import { InjectionToken } from '../src/injection-token.js';
import { topoSort } from '../src/topo-sort.js';

/** Helper to create a minimal BeanDefinition for testing. */
function def(
  token: BeanDefinition['token'],
  deps: BeanDefinition['dependencies'] = [],
): BeanDefinition {
  return {
    token,
    scope: 'singleton',
    dependencies: deps,
    factory: () => ({}),
    eager: false,
    metadata: {},
  };
}

function dep(token: BeanDefinition['token'], optional = false) {
  return { token, optional };
}

describe('topoSort', () => {
  it('returns empty array for empty input', () => {
    expect(topoSort([])).toEqual([]);
  });

  it('returns single bean unchanged', () => {
    class A {}
    const defs = [def(A)];
    const sorted = topoSort(defs);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].token).toBe(A);
  });

  it('orders a simple chain: A → B → C', () => {
    class C {}
    class B {}
    class A {}
    const defs = [def(A, [dep(B)]), def(B, [dep(C)]), def(C)];
    const sorted = topoSort(defs);
    const tokens = sorted.map((d) => d.token);
    expect(tokens.indexOf(C)).toBeLessThan(tokens.indexOf(B));
    expect(tokens.indexOf(B)).toBeLessThan(tokens.indexOf(A));
  });

  it('handles diamond dependencies: A → B,C; B → D; C → D', () => {
    class D {}
    class C {}
    class B {}
    class A {}
    const defs = [
      def(A, [dep(B), dep(C)]),
      def(B, [dep(D)]),
      def(C, [dep(D)]),
      def(D),
    ];
    const sorted = topoSort(defs);
    const tokens = sorted.map((d) => d.token);
    expect(tokens.indexOf(D)).toBeLessThan(tokens.indexOf(B));
    expect(tokens.indexOf(D)).toBeLessThan(tokens.indexOf(C));
    expect(tokens.indexOf(B)).toBeLessThan(tokens.indexOf(A));
    expect(tokens.indexOf(C)).toBeLessThan(tokens.indexOf(A));
  });

  it('detects a direct cycle: A → B → A', () => {
    class A {}
    class B {}
    const defs = [def(A, [dep(B)]), def(B, [dep(A)])];
    expect(() => topoSort(defs)).toThrow(CircularDependencyError);
    try {
      topoSort(defs);
    } catch (e) {
      expect(e).toBeInstanceOf(CircularDependencyError);
      const err = e as CircularDependencyError;
      expect(err.cyclePath).toContain('A');
      expect(err.cyclePath).toContain('B');
    }
  });

  it('detects a 3-node cycle: A → B → C → A', () => {
    class A {}
    class B {}
    class C {}
    const defs = [def(A, [dep(B)]), def(B, [dep(C)]), def(C, [dep(A)])];
    expect(() => topoSort(defs)).toThrow(CircularDependencyError);
  });

  it('detects self-reference: A → A', () => {
    class A {}
    const defs = [def(A, [dep(A)])];
    expect(() => topoSort(defs)).toThrow(CircularDependencyError);
    try {
      topoSort(defs);
    } catch (e) {
      const err = e as CircularDependencyError;
      expect(err.cyclePath).toEqual(['A', 'A']);
    }
  });

  it('skips missing optional dependencies without error', () => {
    class A {}
    const missingToken = new InjectionToken<string>('missing');
    const defs = [def(A, [dep(missingToken, true)])];
    const sorted = topoSort(defs);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].token).toBe(A);
  });

  it('orders optional dependencies when they are present', () => {
    class A {}
    class B {}
    const defs = [def(A, [dep(B, true)]), def(B)];
    const sorted = topoSort(defs);
    const tokens = sorted.map((d) => d.token);
    expect(tokens.indexOf(B)).toBeLessThan(tokens.indexOf(A));
  });

  it('works with InjectionToken-based dependencies', () => {
    const tokenA = new InjectionToken<string>('A');
    const tokenB = new InjectionToken<number>('B');
    const defs = [def(tokenA, [dep(tokenB)]), def(tokenB)];
    const sorted = topoSort(defs);
    expect(sorted[0].token).toBe(tokenB);
    expect(sorted[1].token).toBe(tokenA);
  });
});
