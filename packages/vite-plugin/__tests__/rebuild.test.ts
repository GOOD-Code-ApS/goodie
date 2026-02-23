import { TransformerError } from '@goodie/transformer';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedOptions } from '../src/options.js';
import { runRebuild } from '../src/rebuild.js';

vi.mock('@goodie/transformer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodie/transformer')>();
  return {
    ...actual,
    transform: vi.fn(),
  };
});

import { transform } from '@goodie/transformer';

const mockTransform = vi.mocked(transform);

const defaultOptions: ResolvedOptions = {
  tsConfigPath: '/project/tsconfig.json',
  outputPath: '/project/src/AppContext.generated.ts',
  include: undefined,
  debounceMs: 100,
};

describe('runRebuild', () => {
  it('returns success with TransformResult on successful transform', () => {
    const fakeResult = {
      code: '// generated',
      outputPath: defaultOptions.outputPath,
      beans: [{ id: 'A' }],
      warnings: [],
    };
    mockTransform.mockReturnValue(fakeResult as any);

    const outcome = runRebuild(defaultOptions);

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result).toBe(fakeResult);
    }
  });

  it('passes correct options to transform', () => {
    mockTransform.mockReturnValue({
      code: '',
      outputPath: '',
      beans: [],
      warnings: [],
    } as any);

    const opts: ResolvedOptions = {
      tsConfigPath: '/custom/tsconfig.json',
      outputPath: '/custom/output.ts',
      include: ['src/**/*.ts'],
      debounceMs: 200,
    };

    runRebuild(opts);

    expect(mockTransform).toHaveBeenCalledWith({
      tsConfigFilePath: '/custom/tsconfig.json',
      outputPath: '/custom/output.ts',
      include: ['src/**/*.ts'],
    });
  });

  it('returns failure with TransformerError', () => {
    const transformerError = new TransformerError(
      'Missing provider',
      { filePath: 'foo.ts', line: 1, column: 0 },
      'Add @Injectable()',
    );
    mockTransform.mockImplementation(() => {
      throw transformerError;
    });

    const outcome = runRebuild(defaultOptions);

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error).toBe(transformerError);
    }
  });

  it('returns failure wrapping non-TransformerError exceptions', () => {
    mockTransform.mockImplementation(() => {
      throw new TypeError('Cannot read properties of undefined');
    });

    const outcome = runRebuild(defaultOptions);

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error).toBeInstanceOf(TypeError);
      expect(outcome.error.message).toBe('Cannot read properties of undefined');
    }
  });

  it('wraps non-Error throws into an Error', () => {
    mockTransform.mockImplementation(() => {
      throw 'string error';
    });

    const outcome = runRebuild(defaultOptions);

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error).toBeInstanceOf(Error);
      expect(outcome.error.message).toBe('string error');
    }
  });
});
