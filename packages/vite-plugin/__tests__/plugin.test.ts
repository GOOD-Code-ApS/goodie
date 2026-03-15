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

function successResult(componentCount: number, warnings: string[] = []) {
  return {
    success: true as const,
    result: {
      code: '// generated',
      outputPath: '/project/src/__generated__/context.ts',
      components: Array.from({ length: componentCount }, (_, i) => ({
        id: `Component${i}`,
      })),
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
    buildStart: () => Promise<void>;
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
    it('resolves options using config.root', async () => {
      const plugin = setupPlugin(undefined, '/my/root');
      mockRunRebuild.mockResolvedValue(successResult(0));
      await plugin.buildStart();
      expect(mockRunRebuild).toHaveBeenCalledWith({
        tsConfigPath: path.resolve('/my/root', 'tsconfig.json'),
        outputPath: path.resolve('/my/root', 'src/__generated__/context.ts'),
        include: undefined,
        debounceMs: 100,
        plugins: [],
      });
    });

    it('passes custom options through', async () => {
      const plugin = setupPlugin(
        {
          tsConfigPath: 'tsconfig.app.json',
          debounceMs: 50,
        },
        '/project',
      );
      mockRunRebuild.mockResolvedValue(successResult(0));
      await plugin.buildStart();
      expect(mockRunRebuild).toHaveBeenCalledWith(
        expect.objectContaining({
          tsConfigPath: path.resolve('/project', 'tsconfig.app.json'),
          debounceMs: 50,
        }),
      );
    });
  });

  describe('buildStart', () => {
    it('logs component count on success', async () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockResolvedValue(successResult(5));

      await plugin.buildStart();

      expect(console.log).toHaveBeenCalledWith(
        '[goodie] Transform complete: 5 component(s) registered.',
      );
    });

    it('logs warnings on success', async () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockResolvedValue(
        successResult(1, ['Unused component: Foo']),
      );

      await plugin.buildStart();

      expect(console.warn).toHaveBeenCalledWith(
        '[goodie] Warning: Unused component: Foo',
      );
    });

    it('throws on failure (aborts build)', async () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockResolvedValue(
        failureResult('Missing provider for "Foo"'),
      );

      await expect(plugin.buildStart()).rejects.toThrow(
        'Missing provider for "Foo"',
      );
    });
  });

  describe('handleHotUpdate', () => {
    it('triggers rebuild on .ts file change', async () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockResolvedValue(successResult(3));

      plugin.handleHotUpdate(makeHmrContext('/project/src/service.ts'));
      await vi.advanceTimersByTimeAsync(100);

      expect(mockRunRebuild).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith(
        '[goodie] Rebuild complete: 3 component(s) registered.',
      );
    });

    it('ignores non-.ts files', async () => {
      const plugin = setupPlugin();

      plugin.handleHotUpdate(makeHmrContext('/project/src/styles.css'));
      await vi.advanceTimersByTimeAsync(200);

      expect(mockRunRebuild).not.toHaveBeenCalled();
    });

    it('ignores files inside the __generated__/ directory', async () => {
      const plugin = setupPlugin(undefined, '/project');

      // The main context file
      const contextPath = path.resolve(
        '/project',
        'src/__generated__/context.ts',
      );
      plugin.handleHotUpdate(makeHmrContext(contextPath));
      await vi.advanceTimersByTimeAsync(200);
      expect(mockRunRebuild).not.toHaveBeenCalled();

      // Any other file in __generated__/
      const otherGenerated = path.resolve(
        '/project',
        'src/__generated__/routes.ts',
      );
      plugin.handleHotUpdate(makeHmrContext(otherGenerated));
      await vi.advanceTimersByTimeAsync(200);
      expect(mockRunRebuild).not.toHaveBeenCalled();
    });

    it('debounces rapid changes', async () => {
      const plugin = setupPlugin({ debounceMs: 100 });
      mockRunRebuild.mockResolvedValue(successResult(2));

      plugin.handleHotUpdate(makeHmrContext('/project/src/a.ts'));
      await vi.advanceTimersByTimeAsync(50);
      plugin.handleHotUpdate(makeHmrContext('/project/src/b.ts'));
      await vi.advanceTimersByTimeAsync(50);
      plugin.handleHotUpdate(makeHmrContext('/project/src/c.ts'));
      await vi.advanceTimersByTimeAsync(100);

      // Only one rebuild should have fired (the last debounced one)
      expect(mockRunRebuild).toHaveBeenCalledTimes(1);
    });

    it('logs warnings during hot update rebuild', async () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockResolvedValue(
        successResult(1, ['Optional dep missing']),
      );

      plugin.handleHotUpdate(makeHmrContext('/project/src/service.ts'));
      await vi.advanceTimersByTimeAsync(100);

      expect(console.warn).toHaveBeenCalledWith(
        '[goodie] Warning: Optional dep missing',
      );
    });

    it('logs errors without crashing on rebuild failure', async () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockResolvedValue(failureResult('Circular dependency'));

      // Should NOT throw
      plugin.handleHotUpdate(makeHmrContext('/project/src/service.ts'));
      await vi.advanceTimersByTimeAsync(100);

      expect(console.error).toHaveBeenCalledWith(
        '[goodie] Rebuild failed: Circular dependency',
      );
    });

    it('sends error to Vite HMR overlay on rebuild failure', async () => {
      const plugin = setupPlugin();
      const error = new Error('Missing provider for "Foo"');
      error.stack = 'Error: Missing provider for "Foo"\n    at resolve (...)';
      mockRunRebuild.mockResolvedValue({
        success: false as const,
        error,
      });

      const ctx = makeHmrContext('/project/src/service.ts');
      plugin.handleHotUpdate(ctx);
      await vi.advanceTimersByTimeAsync(100);

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

    it('fires separate rebuilds after debounce window passes', async () => {
      const plugin = setupPlugin({ debounceMs: 100 });
      mockRunRebuild.mockResolvedValue(successResult(1));

      plugin.handleHotUpdate(makeHmrContext('/project/src/a.ts'));
      await vi.advanceTimersByTimeAsync(100);

      plugin.handleHotUpdate(makeHmrContext('/project/src/b.ts'));
      await vi.advanceTimersByTimeAsync(100);

      expect(mockRunRebuild).toHaveBeenCalledTimes(2);
    });

    it('calls runRebuild with resolved options only', async () => {
      const plugin = setupPlugin();
      mockRunRebuild.mockResolvedValue(successResult(0));

      // buildStart
      await plugin.buildStart();
      mockRunRebuild.mockClear();

      // HMR should call runRebuild with just the resolved options
      mockRunRebuild.mockResolvedValue(successResult(0));
      plugin.handleHotUpdate(makeHmrContext('/project/src/service.ts'));
      await vi.advanceTimersByTimeAsync(100);

      expect(mockRunRebuild).toHaveBeenCalledWith(
        expect.objectContaining({
          tsConfigPath: expect.any(String),
          outputPath: expect.any(String),
        }),
      );
      // Should only receive one argument (resolved options)
      expect(mockRunRebuild).toHaveBeenCalledTimes(1);
      expect(mockRunRebuild.mock.calls[0]).toHaveLength(1);
    });
  });
});
