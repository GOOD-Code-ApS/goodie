import fs from 'node:fs';
import path from 'node:path';
import type { RunTransformOptions } from './run-transform.js';
import { logOutcome, runTransform } from './run-transform.js';

const DEFAULT_DEBOUNCE_MS = 100;

export interface WatchOptions extends RunTransformOptions {
  /** Directory to watch (defaults to cwd) */
  watchDir: string;
  /** Debounce interval in ms (default: 100) */
  debounceMs?: number;
}

export interface WatchHandle {
  close(): void;
}

export function watchAndRebuild(options: WatchOptions): WatchHandle {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const normalizedOutput = path.normalize(options.outputPath);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const watcher = fs.watch(
    options.watchDir,
    { recursive: true },
    (_event, filename) => {
      if (!filename) return;

      // Only react to .ts files
      if (!filename.endsWith('.ts')) return;

      // Skip the generated output file to prevent infinite loops
      const absolutePath = path.resolve(options.watchDir, filename);
      if (path.normalize(absolutePath) === normalizedOutput) return;

      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        const outcome = runTransform(options);
        logOutcome(outcome);
      }, debounceMs);
    },
  );

  return {
    close() {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      watcher.close();
    },
  };
}
