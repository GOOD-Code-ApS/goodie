import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveOptions } from '../src/options.js';

describe('resolveOptions', () => {
  const viteRoot = '/project';

  it('applies default tsConfigPath when not provided', () => {
    const result = resolveOptions(undefined, viteRoot);
    expect(result.tsConfigPath).toBe(path.resolve(viteRoot, 'tsconfig.json'));
  });

  it('applies default outputPath when not provided', () => {
    const result = resolveOptions(undefined, viteRoot);
    expect(result.outputPath).toBe(
      path.resolve(viteRoot, 'src/AppContext.generated.ts'),
    );
  });

  it('applies default debounceMs when not provided', () => {
    const result = resolveOptions(undefined, viteRoot);
    expect(result.debounceMs).toBe(100);
  });

  it('leaves include as undefined when not provided', () => {
    const result = resolveOptions(undefined, viteRoot);
    expect(result.include).toBeUndefined();
  });

  it('resolves custom tsConfigPath relative to viteRoot', () => {
    const result = resolveOptions(
      { tsConfigPath: 'config/tsconfig.app.json' },
      viteRoot,
    );
    expect(result.tsConfigPath).toBe(
      path.resolve(viteRoot, 'config/tsconfig.app.json'),
    );
  });

  it('resolves custom outputPath relative to viteRoot', () => {
    const result = resolveOptions({ outputPath: 'generated/DI.ts' }, viteRoot);
    expect(result.outputPath).toBe(path.resolve(viteRoot, 'generated/DI.ts'));
  });

  it('preserves absolute tsConfigPath as-is', () => {
    const abs = '/absolute/path/tsconfig.json';
    const result = resolveOptions({ tsConfigPath: abs }, viteRoot);
    expect(result.tsConfigPath).toBe(abs);
  });

  it('preserves absolute outputPath as-is', () => {
    const abs = '/absolute/path/Generated.ts';
    const result = resolveOptions({ outputPath: abs }, viteRoot);
    expect(result.outputPath).toBe(abs);
  });

  it('uses custom debounceMs', () => {
    const result = resolveOptions({ debounceMs: 250 }, viteRoot);
    expect(result.debounceMs).toBe(250);
  });

  it('passes through include globs', () => {
    const include = ['src/**/*.ts', 'lib/**/*.ts'];
    const result = resolveOptions({ include }, viteRoot);
    expect(result.include).toEqual(include);
  });

  it('handles empty options object same as undefined', () => {
    const result = resolveOptions({}, viteRoot);
    expect(result.tsConfigPath).toBe(path.resolve(viteRoot, 'tsconfig.json'));
    expect(result.outputPath).toBe(
      path.resolve(viteRoot, 'src/AppContext.generated.ts'),
    );
    expect(result.debounceMs).toBe(100);
    expect(result.include).toBeUndefined();
  });
});
