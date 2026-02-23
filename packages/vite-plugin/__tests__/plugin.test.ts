import path from 'node:path';
import type { HmrContext, Plugin, ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diPlugin } from '../src/plugin.js';

vi.mock('../src/rebuild.js', () => ({
  runRebuild: vi.fn(),
}));

import { runRebuild } from '../src/rebuild.js';

const mockRunRebuild = vi.mocked(runRebuild);

function makeConfig(root: string): ResolvedConfig {
  return { root } as ResolvedConfig;
}

function makeHmrContext(filePath: string): HmrContext {
  return {
    file: filePath,
    server: { ws: { send: vi.fn() } },
  } as unknown as HmrContext;
}

function successResult(beanCount: number, warnings: string[] = []) {
  return {
    success: true as const,
    result: {
      code: '// generated',
      outputPath: '/project/src/AppContext.generated.ts',
      beans: Array.from({ length: beanCount }, (_, i) => ({ id: `Bean${i}` })),
      warnings,
    },
  };
}

function failureResult(message: string) {
  return {
    success: false as const,
    error: new Error(message),
  };
}

// Helper to extract hook functions from the plugin
function setupPlugin(
  options?: Parameters<typeof diPlugin>[0],
  root = '/project',
) {
  const plugin = diPlugin(options) as Plugin & {
    configResolved: (config: ResolvedConfig) => void;
    buildStart: () => void;
    handleHotUpdate: (ctx: HmrContext) => void;
  };
  plugin.configResolved(makeConfig(root));
  return plugin;
}

describe('diPlugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('plugin metadata', () => {
    it('has name "goodie"', () => {
      const plugin = diPlugin() as Plugin;
      expect(plugin.name).toBe('goodie');
    });

    it('enforces "pre"', () => {
      const plugin = diPlugin() as Plugin;
      expect(plugin.enforce).toBe('pre');
    });
  });

  describe('configResolved', () => {
    it('resolves options using config.root', () => {
      const plugin = setupPlugin(undefined, '/my/root');
      // Verify by running buildStart — it will use the resolved options
      mockRunRebuild.mockReturnValue(successResult(0));
      plugin.buildStart();
      expect(mockRunRebuild).toHaveBeenCalledWith({
        tsConfigPath: path.resolve('/my/root', 'tsconfig.json'),
        outputPath: path.resolve('/my/root', 'src/AppContext.generated.ts'),
        include: undefined,
        debounceMs: 100,
      });
    });

    it('passes custom options through', () => {
      const plugin = setupPlugin(
        {
          tsConfigPath: 'tsconfig.app.json',
          debounceMs: 50,
        },
        '/project',
      );
      mockRunRebuild.mockReturnValue(successResult(0));
      plugin.buildStart();
      expect(mockRunRebuild).toHaveBeenCalledWith(
        expect.objectContaining({
          tsConfigPath: path.resolve('/project', 'tsconfig.app.json'),
          debounceMs: 50,
        }),
      );
    });
  });

  describe('buildStart', () => {
    it('logs bean count on success', () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockReturnValue(successResult(5));

      plugin.buildStart();

      expect(console.log).toHaveBeenCalledWith(
        '[goodie] Transform complete: 5 bean(s) registered.',
      );
    });

    it('logs warnings on success', () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockReturnValue(successResult(1, ['Unused bean: Foo']));

      plugin.buildStart();

      expect(console.warn).toHaveBeenCalledWith(
        '[goodie] Warning: Unused bean: Foo',
      );
    });

    it('throws on failure (aborts build)', () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockReturnValue(
        failureResult('Missing provider for "Foo"'),
      );

      expect(() => plugin.buildStart()).toThrow('Missing provider for "Foo"');
    });
  });

  describe('handleHotUpdate', () => {
    it('triggers rebuild on .ts file change', () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockReturnValue(successResult(3));

      plugin.handleHotUpdate(makeHmrContext('/project/src/service.ts'));
      vi.advanceTimersByTime(100);

      // First call is from buildStart setup? No — we didn't call buildStart
      expect(mockRunRebuild).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith(
        '[goodie] Rebuild complete: 3 bean(s) registered.',
      );
    });

    it('ignores non-.ts files', () => {
      const plugin = setupPlugin();

      plugin.handleHotUpdate(makeHmrContext('/project/src/styles.css'));
      vi.advanceTimersByTime(200);

      expect(mockRunRebuild).not.toHaveBeenCalled();
    });

    it('ignores the generated output file', () => {
      const plugin = setupPlugin(undefined, '/project');

      const outputPath = path.resolve(
        '/project',
        'src/AppContext.generated.ts',
      );
      plugin.handleHotUpdate(makeHmrContext(outputPath));
      vi.advanceTimersByTime(200);

      expect(mockRunRebuild).not.toHaveBeenCalled();
    });

    it('debounces rapid changes', () => {
      const plugin = setupPlugin({ debounceMs: 100 });
      mockRunRebuild.mockReturnValue(successResult(2));

      plugin.handleHotUpdate(makeHmrContext('/project/src/a.ts'));
      vi.advanceTimersByTime(50);
      plugin.handleHotUpdate(makeHmrContext('/project/src/b.ts'));
      vi.advanceTimersByTime(50);
      plugin.handleHotUpdate(makeHmrContext('/project/src/c.ts'));
      vi.advanceTimersByTime(100);

      // Only one rebuild should have fired (the last debounced one)
      expect(mockRunRebuild).toHaveBeenCalledTimes(1);
    });

    it('logs warnings during hot update rebuild', () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockReturnValue(
        successResult(1, ['Optional dep missing']),
      );

      plugin.handleHotUpdate(makeHmrContext('/project/src/service.ts'));
      vi.advanceTimersByTime(100);

      expect(console.warn).toHaveBeenCalledWith(
        '[goodie] Warning: Optional dep missing',
      );
    });

    it('logs errors without crashing on rebuild failure', () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockReturnValue(failureResult('Circular dependency'));

      // Should NOT throw
      plugin.handleHotUpdate(makeHmrContext('/project/src/service.ts'));
      vi.advanceTimersByTime(100);

      expect(console.error).toHaveBeenCalledWith(
        '[goodie] Rebuild failed: Circular dependency',
      );
    });

    it('sends error to Vite HMR overlay on rebuild failure', () => {
      const plugin = setupPlugin();
      const error = new Error('Missing provider for "Foo"');
      error.stack = 'Error: Missing provider for "Foo"\n    at resolve (...)';
      mockRunRebuild.mockReturnValue({
        success: false as const,
        error,
      });

      const ctx = makeHmrContext('/project/src/service.ts');
      plugin.handleHotUpdate(ctx);
      vi.advanceTimersByTime(100);

      const wsSend = (ctx.server as { ws: { send: ReturnType<typeof vi.fn> } })
        .ws.send;
      expect(wsSend).toHaveBeenCalledWith({
        type: 'error',
        err: {
          message: 'Missing provider for "Foo"',
          stack: 'Error: Missing provider for "Foo"\n    at resolve (...)',
          plugin: 'goodie',
        },
      });
    });

    it('fires separate rebuilds after debounce window passes', () => {
      const plugin = setupPlugin({ debounceMs: 100 });
      mockRunRebuild.mockReturnValue(successResult(1));

      plugin.handleHotUpdate(makeHmrContext('/project/src/a.ts'));
      vi.advanceTimersByTime(100);

      plugin.handleHotUpdate(makeHmrContext('/project/src/b.ts'));
      vi.advanceTimersByTime(100);

      expect(mockRunRebuild).toHaveBeenCalledTimes(2);
    });
  });
});
