import path from 'node:path';
import type {
  TransformLibraryResult,
  TransformResult,
} from '@goodie-ts/transformer';
import {
  TransformerError,
  transform,
  transformLibrary,
} from '@goodie-ts/transformer';

export interface RunTransformOptions {
  tsConfigPath: string;
  outputPath: string;
  scanScopes?: string[];
}

export interface RunTransformLibraryOptions {
  tsConfigPath: string;
  packageName: string;
  beansOutputPath: string;
  codeOutputPath?: string;
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

export async function runTransform(
  options: RunTransformOptions,
): Promise<TransformOutcome> {
  const start = performance.now();
  try {
    const result = await transform({
      tsConfigFilePath: options.tsConfigPath,
      outputPath: options.outputPath,
      scanScopes: options.scanScopes,
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

export interface LibraryTransformSuccess {
  success: true;
  result: TransformLibraryResult;
  durationMs: number;
}

export type LibraryTransformOutcome =
  | LibraryTransformSuccess
  | TransformFailure;

export async function runTransformLibrary(
  options: RunTransformLibraryOptions,
): Promise<LibraryTransformOutcome> {
  const start = performance.now();
  try {
    const result = await transformLibrary({
      tsConfigFilePath: options.tsConfigPath,
      packageName: options.packageName,
      beansOutputPath: options.beansOutputPath,
      codeOutputPath: options.codeOutputPath,
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
    logError(outcome);
  }
}

export function logLibraryOutcome(outcome: LibraryTransformOutcome): void {
  if (outcome.success) {
    const { result, durationMs } = outcome;
    const ms = Math.round(durationMs);
    const cwd = process.cwd();
    const beansPath = path.relative(cwd, result.outputPath);
    const codePath = result.codeOutputPath
      ? path.relative(cwd, result.codeOutputPath)
      : undefined;

    const outputs = codePath ? `${beansPath} + ${codePath}` : beansPath;

    console.log(
      `[goodie] Library build: ${result.beans.length} bean(s) → ${outputs} in ${ms}ms`,
    );
    for (const w of result.warnings) {
      console.warn(`[goodie] Warning: ${w}`);
    }
  } else {
    logError(outcome);
  }
}

function logError(outcome: TransformFailure): void {
  console.error(`[goodie] Transform failed: ${outcome.error.message}`);
  if (outcome.error instanceof TransformerError && outcome.error.hint) {
    console.error(`[goodie] Hint: ${outcome.error.hint}`);
  }
}
