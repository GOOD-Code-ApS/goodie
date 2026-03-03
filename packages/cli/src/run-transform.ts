import path from 'node:path';
import type { TransformResult } from '@goodie-ts/transformer';
import { TransformerError, transform } from '@goodie-ts/transformer';

export interface RunTransformOptions {
  tsConfigPath: string;
  outputPath: string;
}

export interface TransformSuccess {
  success: true;
  result: TransformResult;
  durationMs: number;
}

export interface TransformFailure {
  success: false;
  error: Error;
}

export type TransformOutcome = TransformSuccess | TransformFailure;

export function runTransform(options: RunTransformOptions): TransformOutcome {
  const start = performance.now();
  try {
    const result = transform({
      tsConfigFilePath: options.tsConfigPath,
      outputPath: options.outputPath,
    });
    const durationMs = performance.now() - start;
    return { success: true, result, durationMs };
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

export function logOutcome(outcome: TransformOutcome): void {
  if (outcome.success) {
    const { result, durationMs } = outcome;
    const ms = Math.round(durationMs);
    console.log(
      `[goodie] Generated ${path.relative(process.cwd(), result.outputPath)} — ${result.beans.length} bean(s) in ${ms}ms`,
    );
    for (const w of result.warnings) {
      console.warn(`[goodie] Warning: ${w}`);
    }
  } else {
    console.error(`[goodie] Transform failed: ${outcome.error.message}`);
    if (outcome.error instanceof TransformerError && outcome.error.hint) {
      console.error(`[goodie] Hint: ${outcome.error.hint}`);
    }
  }
}
