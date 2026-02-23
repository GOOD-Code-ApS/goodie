import type { TransformResult } from '@goodie/transformer';
import { TransformerError, transform } from '@goodie/transformer';
import type { ResolvedOptions } from './options.js';

export type RebuildSuccess = { success: true; result: TransformResult };
export type RebuildFailure = { success: false; error: Error };
export type RebuildOutcome = RebuildSuccess | RebuildFailure;

/**
 * Run the full DI transform pipeline, returning a discriminated union.
 * This is the single swap-point for incremental rebuilds later.
 */
export function runRebuild(options: ResolvedOptions): RebuildOutcome {
  try {
    const result = transform({
      tsConfigFilePath: options.tsConfigPath,
      outputPath: options.outputPath,
      include: options.include,
    });
    return { success: true, result };
  } catch (error) {
    if (error instanceof TransformerError) {
      return { success: false, error };
    }
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
