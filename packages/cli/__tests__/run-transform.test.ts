import { TransformerError } from '@goodie-ts/transformer';
import { describe, expect, it, vi } from 'vitest';
import type { TransformOutcome } from '../src/run-transform.js';
import { logOutcome, runTransform } from '../src/run-transform.js';

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

const defaultOptions = {
  tsConfigPath: '/project/tsconfig.json',
  outputPath: '/project/src/AppContext.generated.ts',
};

describe('runTransform', () => {
  it('returns success with result and timing', () => {
    const fakeResult = {
      code: '// generated',
      outputPath: defaultOptions.outputPath,
      beans: [{ id: 'A' }, { id: 'B' }],
      warnings: [],
    };
    mockTransform.mockReturnValue(fakeResult as any);

    const outcome = runTransform(defaultOptions);

    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.result).toBe(fakeResult);
      expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('passes tsConfigPath and outputPath to transform', () => {
    mockTransform.mockReturnValue({
      code: '',
      outputPath: '',
      beans: [],
      warnings: [],
    } as any);

    runTransform(defaultOptions);

    expect(mockTransform).toHaveBeenCalledWith({
      tsConfigFilePath: '/project/tsconfig.json',
      outputPath: '/project/src/AppContext.generated.ts',
    });
  });

  it('returns failure on TransformerError', () => {
    const error = new TransformerError(
      'Missing provider',
      { filePath: 'foo.ts', line: 1, column: 0 },
      'Add @Injectable()',
    );
    mockTransform.mockImplementation(() => {
      throw error;
    });

    const outcome = runTransform(defaultOptions);

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error).toBe(error);
    }
  });

  it('wraps non-Error throws into an Error', () => {
    mockTransform.mockImplementation(() => {
      throw 'string error';
    });

    const outcome = runTransform(defaultOptions);

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error).toBeInstanceOf(Error);
      expect(outcome.error.message).toBe('string error');
    }
  });
});

describe('logOutcome', () => {
  it('logs bean count and timing on success', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome: TransformOutcome = {
      success: true,
      result: {
        code: '// generated',
        outputPath: '/project/src/AppContext.generated.ts',
        beans: [{ id: 'A' }, { id: 'B' }] as any,
        warnings: [],
      },
      durationMs: 123.456,
    };

    logOutcome(outcome);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 bean(s) in 123ms'),
    );
    logSpy.mockRestore();
  });

  it('logs warnings on success', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const outcome: TransformOutcome = {
      success: true,
      result: {
        code: '',
        outputPath: '/project/src/out.ts',
        beans: [] as any,
        warnings: ['Unused bean: Foo'],
      },
      durationMs: 50,
    };

    logOutcome(outcome);

    expect(warnSpy).toHaveBeenCalledWith('[goodie] Warning: Unused bean: Foo');
    warnSpy.mockRestore();
  });

  it('logs error message on failure', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const outcome: TransformOutcome = {
      success: false,
      error: new Error('Something went wrong'),
    };

    logOutcome(outcome);

    expect(errorSpy).toHaveBeenCalledWith(
      '[goodie] Transform failed: Something went wrong',
    );
    errorSpy.mockRestore();
  });

  it('logs hint for TransformerError', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const outcome: TransformOutcome = {
      success: false,
      error: new TransformerError(
        'Missing provider',
        { filePath: 'foo.ts', line: 1, column: 0 },
        'Add @Injectable()',
      ),
    };

    logOutcome(outcome);

    expect(errorSpy).toHaveBeenCalledWith('[goodie] Hint: Add @Injectable()');
    errorSpy.mockRestore();
  });
});
