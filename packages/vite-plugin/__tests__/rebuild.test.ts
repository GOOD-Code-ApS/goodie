import { TransformerError } from '@goodie-ts/transformer';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedOptions } from '../src/options.js';
import { runRebuild } from '../src/rebuild.js';

vi.mock('@goodie-ts/transformer', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@goodie-ts/transformer')>();
  return {
    ...actual,
    transformWithProject: vi.fn(),
  };
});

vi.mock('ts-morph', () => ({
  Project: vi.fn().mockImplementation(() => ({
    addSourceFilesAtPaths: vi.fn(),
    getSourceFile: vi.fn().mockReturnValue(undefined),
    addSourceFileAtPath: vi.fn(),
  })),
}));

import { transformWithProject } from '@goodie-ts/transformer';
import { Project } from 'ts-morph';

const mockTransformWithProject = vi.mocked(transformWithProject);

const defaultOptions: ResolvedOptions = {
  tsConfigPath: '/project/tsconfig.json',
  outputPath: '/project/src/AppContext.generated.ts',
  include: undefined,
  debounceMs: 100,
};

describe('runRebuild', () => {
  describe('full rebuild (no cached project)', () => {
    it('returns success with TransformResult and Project', () => {
      const fakeResult = {
        code: '// generated',
        outputPath: defaultOptions.outputPath,
        beans: [{ id: 'A' }],
        warnings: [],
      };
      mockTransformWithProject.mockReturnValue(fakeResult as any);

      const outcome = runRebuild(defaultOptions);

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.result).toBe(fakeResult);
        expect(outcome.project).toBeDefined();
      }
    });

    it('creates a fresh Project with tsConfigFilePath', () => {
      mockTransformWithProject.mockReturnValue({
        code: '',
        outputPath: '',
        beans: [],
        warnings: [],
      } as any);

      runRebuild(defaultOptions);

      expect(Project).toHaveBeenCalledWith({
        tsConfigFilePath: '/project/tsconfig.json',
      });
    });

    it('adds include paths when specified', () => {
      const addSourceFilesAtPaths = vi.fn();
      vi.mocked(Project).mockImplementation(
        () =>
          ({
            addSourceFilesAtPaths,
            getSourceFile: vi.fn(),
            addSourceFileAtPath: vi.fn(),
          }) as any,
      );
      mockTransformWithProject.mockReturnValue({
        code: '',
        outputPath: '',
        beans: [],
        warnings: [],
      } as any);

      const opts: ResolvedOptions = {
        ...defaultOptions,
        include: ['src/**/*.ts'],
      };
      runRebuild(opts);

      expect(addSourceFilesAtPaths).toHaveBeenCalledWith(['src/**/*.ts']);
    });

    it('returns failure with TransformerError', () => {
      const transformerError = new TransformerError(
        'Missing provider',
        { filePath: 'foo.ts', line: 1, column: 0 },
        'Add @Injectable()',
      );
      mockTransformWithProject.mockImplementation(() => {
        throw transformerError;
      });

      const outcome = runRebuild(defaultOptions);

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBe(transformerError);
      }
    });

    it('returns failure wrapping non-TransformerError exceptions', () => {
      mockTransformWithProject.mockImplementation(() => {
        throw new TypeError('Cannot read properties of undefined');
      });

      const outcome = runRebuild(defaultOptions);

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBeInstanceOf(TypeError);
        expect(outcome.error.message).toBe(
          'Cannot read properties of undefined',
        );
      }
    });

    it('wraps non-Error throws into an Error', () => {
      mockTransformWithProject.mockImplementation(() => {
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

  describe('incremental rebuild (cached project)', () => {
    it('refreshes the changed file on the cached project', () => {
      const refreshFromFileSystem = vi.fn();
      const cachedProject = {
        getSourceFile: vi.fn().mockReturnValue({ refreshFromFileSystem }),
        addSourceFileAtPath: vi.fn(),
      } as any;
      mockTransformWithProject.mockReturnValue({
        code: '',
        outputPath: '',
        beans: [],
        warnings: [],
      } as any);

      const outcome = runRebuild(
        defaultOptions,
        cachedProject,
        '/project/src/service.ts',
      );

      expect(cachedProject.getSourceFile).toHaveBeenCalledWith(
        '/project/src/service.ts',
      );
      expect(refreshFromFileSystem).toHaveBeenCalled();
      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.project).toBe(cachedProject);
      }
    });

    it('adds new file if not already in project', () => {
      const cachedProject = {
        getSourceFile: vi.fn().mockReturnValue(undefined),
        addSourceFileAtPath: vi.fn(),
      } as any;
      mockTransformWithProject.mockReturnValue({
        code: '',
        outputPath: '',
        beans: [],
        warnings: [],
      } as any);

      runRebuild(defaultOptions, cachedProject, '/project/src/new-file.ts');

      expect(cachedProject.addSourceFileAtPath).toHaveBeenCalledWith(
        '/project/src/new-file.ts',
      );
    });

    it('falls back to full rebuild when incremental fails', () => {
      const cachedProject = {
        getSourceFile: vi.fn().mockImplementation(() => {
          throw new Error('file removed');
        }),
      } as any;

      let callCount = 0;
      mockTransformWithProject.mockImplementation(() => {
        callCount++;
        return {
          code: '',
          outputPath: '',
          beans: [],
          warnings: [],
        } as any;
      });

      const outcome = runRebuild(
        defaultOptions,
        cachedProject,
        '/project/src/deleted.ts',
      );

      // Should succeed via fallback (creates fresh Project)
      expect(outcome.success).toBe(true);
      if (outcome.success) {
        // The returned project should be a new Project, not the cached one
        expect(outcome.project).not.toBe(cachedProject);
      }
    });

    it('does full rebuild when no changedFile provided', () => {
      const cachedProject = {
        getSourceFile: vi.fn(),
        refreshFromFileSystem: vi.fn(),
      } as any;
      mockTransformWithProject.mockReturnValue({
        code: '',
        outputPath: '',
        beans: [],
        warnings: [],
      } as any);

      // cachedProject without changedFile → should create fresh project
      const outcome = runRebuild(defaultOptions, cachedProject);

      expect(outcome.success).toBe(true);
      // getSourceFile should not have been called since we skip incremental path
      expect(cachedProject.getSourceFile).not.toHaveBeenCalled();
    });
  });
});
