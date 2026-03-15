import { TransformerError } from '@goodie-ts/transformer';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedOptions } from '../src/options.js';
import { runRebuild } from '../src/rebuild.js';

vi.mock('@goodie-ts/transformer', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@goodie-ts/transformer')>();
  return {
    ...actual,
    transform: vi.fn(),
  };
});

import { transform } from '@goodie-ts/transformer';

const mockTransform = vi.mocked(transform);

const defaultOptions: ResolvedOptions = {
  tsConfigPath: '/project/tsconfig.json',
  outputPath: '/project/src/__generated__/context.ts',
  include: undefined,
  debounceMs: 100,
  plugins: [],
};

describe('runRebuild', () => {
  it('returns success with TransformResult', async () => {
    const fakeResult = {
      code: '// generated',
      outputPath: defaultOptions.outputPath,
      components: [{ id: 'A' }],
      warnings: [],
    };
    mockTransform.mockResolvedValue(fakeResult as any);

    const outcome = await runRebuild(defaultOptions);

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result).toBe(fakeResult);
    }
  });

  it('passes tsConfigFilePath, outputPath, and include to transform', async () => {
    mockTransform.mockResolvedValue({
      code: '',
      outputPath: '',
      components: [],
      warnings: [],
    } as any);

    const opts: ResolvedOptions = {
      ...defaultOptions,
      include: ['src/**/*.ts'],
    };
    await runRebuild(opts);

    expect(mockTransform).toHaveBeenCalledWith({
      tsConfigFilePath: '/project/tsconfig.json',
      outputPath: '/project/src/__generated__/context.ts',
      include: ['src/**/*.ts'],
      plugins: [],
    });
  });

  it('returns failure with TransformerError', async () => {
    const transformerError = new TransformerError(
      'Missing provider',
      { filePath: 'foo.ts', line: 1, column: 0 },
      'Add @Transient()',
    );
    mockTransform.mockRejectedValue(transformerError);

    const outcome = await runRebuild(defaultOptions);

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error).toBe(transformerError);
    }
  });

  it('returns failure wrapping non-TransformerError exceptions', async () => {
    mockTransform.mockRejectedValue(
      new TypeError('Cannot read properties of undefined'),
    );

    const outcome = await runRebuild(defaultOptions);

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error).toBeInstanceOf(TypeError);
      expect(outcome.error.message).toBe('Cannot read properties of undefined');
    }
  });

  it('wraps non-Error throws into an Error', async () => {
    mockTransform.mockRejectedValue('string error');

    const outcome = await runRebuild(defaultOptions);

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error).toBeInstanceOf(Error);
      expect(outcome.error.message).toBe('string error');
    }
  });
});
