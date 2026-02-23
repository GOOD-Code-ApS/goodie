import path from 'node:path';

/** User-facing options for the Vite DI plugin. */
export interface DiPluginOptions {
  /** Path to tsconfig.json (relative to Vite root or absolute). Defaults to `"tsconfig.json"`. */
  tsConfigPath?: string;
  /** Path for the generated output file (relative to Vite root or absolute). Defaults to `"src/AppContext.generated.ts"`. */
  outputPath?: string;
  /** Source file globs to scan. Passed through to the transformer. */
  include?: string[];
  /** Debounce interval in ms for watch-mode rebuilds. Defaults to `100`. */
  debounceMs?: number;
}

/** Resolved (absolute) options used internally by the plugin. */
export interface ResolvedOptions {
  tsConfigPath: string;
  outputPath: string;
  include: string[] | undefined;
  debounceMs: number;
}

const DEFAULT_TSCONFIG = 'tsconfig.json';
const DEFAULT_OUTPUT = 'src/AppContext.generated.ts';
const DEFAULT_DEBOUNCE_MS = 100;

/** Resolve user options against the Vite project root, applying defaults. */
export function resolveOptions(
  userOptions: DiPluginOptions | undefined,
  viteRoot: string,
): ResolvedOptions {
  const opts = userOptions ?? {};

  return {
    tsConfigPath: opts.tsConfigPath
      ? path.resolve(viteRoot, opts.tsConfigPath)
      : path.resolve(viteRoot, DEFAULT_TSCONFIG),
    outputPath: opts.outputPath
      ? path.resolve(viteRoot, opts.outputPath)
      : path.resolve(viteRoot, DEFAULT_OUTPUT),
    include: opts.include,
    debounceMs: opts.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  };
}
