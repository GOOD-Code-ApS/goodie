import type { TransformResult } from '@goodie-ts/transformer';
import { TransformerError, transform } from '@goodie-ts/transformer';
import type { ResolvedOptions } from './options.js';

export type RebuildSuccess = {
  success: true;
  result: TransformResult;
};
export type RebuildFailure = { success: false; error: Error };
export type RebuildOutcome = RebuildSuccess | RebuildFailure;

/**
 * Run the DI transform pipeline with full rebuild every time.
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
