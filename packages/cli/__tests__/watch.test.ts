import type fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchAndRebuild } from '../src/watch.js';

vi.mock('../src/run-transform.js', () => ({
  runTransform: vi.fn(),
  logOutcome: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    default: {
      ...actual,
      watch: vi.fn(),
    },
  };
});

import { default as fsMod } from 'node:fs';
import { logOutcome, runTransform } from '../src/run-transform.js';

const mockFsWatch = vi.mocked(fsMod.watch);
const mockRunTransform = vi.mocked(runTransform);
const mockLogOutcome = vi.mocked(logOutcome);

const defaultOptions = {
  tsConfigPath: '/project/tsconfig.json',
  outputPath: '/project/src/__generated__/context.ts',
  watchDir: '/project/src',
  debounceMs: 50,
};

function triggerWatch(filename: string | null, event = 'change') {
  const callback = mockFsWatch.mock.calls[0]?.[2] as (
    event: string,
    filename: string | null,
  ) => void;
  callback(event, filename);
}

describe('watchAndRebuild', () => {
  let mockWatcherClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWatcherClose = vi.fn();
    mockFsWatch.mockReturnValue({ close: mockWatcherClose } as any);
    mockRunTransform.mockResolvedValue({
      success: true,
      result: { code: '', outputPath: '', components: [], warnings: [] },
      durationMs: 10,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts watching the watchDir recursively', () => {
    watchAndRebuild(defaultOptions);

    expect(mockFsWatch).toHaveBeenCalledWith(
      '/project/src',
      { recursive: true },
      expect.any(Function),
    );
  });

  it('triggers rebuild on .ts file change after debounce', async () => {
    watchAndRebuild(defaultOptions);

    triggerWatch('service.ts');
    await vi.advanceTimersByTimeAsync(50);

    expect(mockRunTransform).toHaveBeenCalledWith(defaultOptions);
    expect(mockLogOutcome).toHaveBeenCalled();
  });

  it('ignores non-.ts files', async () => {
    watchAndRebuild(defaultOptions);

    triggerWatch('styles.css');
    await vi.advanceTimersByTimeAsync(100);

    expect(mockRunTransform).not.toHaveBeenCalled();
  });

  it('ignores null filename', async () => {
    watchAndRebuild(defaultOptions);

    triggerWatch(null);
    await vi.advanceTimersByTimeAsync(100);

    expect(mockRunTransform).not.toHaveBeenCalled();
  });

  it('ignores files inside the __generated__/ directory', async () => {
    watchAndRebuild(defaultOptions);

    triggerWatch('__generated__/context.ts');
    await vi.advanceTimersByTimeAsync(100);
    expect(mockRunTransform).not.toHaveBeenCalled();

    triggerWatch('__generated__/routes.ts');
    await vi.advanceTimersByTimeAsync(100);
    expect(mockRunTransform).not.toHaveBeenCalled();
  });

  it('debounces rapid changes', async () => {
    watchAndRebuild(defaultOptions);

    triggerWatch('a.ts');
    await vi.advanceTimersByTimeAsync(20);
    triggerWatch('b.ts');
    await vi.advanceTimersByTimeAsync(20);
    triggerWatch('c.ts');
    await vi.advanceTimersByTimeAsync(50);

    expect(mockRunTransform).toHaveBeenCalledTimes(1);
  });

  it('fires separate rebuilds after debounce window passes', async () => {
    watchAndRebuild(defaultOptions);

    triggerWatch('a.ts');
    await vi.advanceTimersByTimeAsync(50);

    triggerWatch('b.ts');
    await vi.advanceTimersByTimeAsync(50);

    expect(mockRunTransform).toHaveBeenCalledTimes(2);
  });

  it('close() stops the watcher and clears pending debounce', async () => {
    const handle = watchAndRebuild(defaultOptions);

    triggerWatch('a.ts');
    // Don't advance timer — close before debounce fires
    handle.close();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockRunTransform).not.toHaveBeenCalled();
    expect(mockWatcherClose).toHaveBeenCalled();
  });
});
