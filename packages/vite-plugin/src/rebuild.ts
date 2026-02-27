import type { TransformResult } from '@goodie-ts/transformer';
import {
  TransformerError,
  transform,
  transformWithProject,
} from '@goodie-ts/transformer';
import { Project } from 'ts-morph';
import type { ResolvedOptions } from './options.js';

export type RebuildSuccess = {
  success: true;
  result: TransformResult;
  project: Project;
};
export type RebuildFailure = { success: false; error: Error };
export type RebuildOutcome = RebuildSuccess | RebuildFailure;

/**
 * Run the DI transform pipeline, optionally reusing a cached ts-morph Project.
 *
 * - First call (no cachedProject): creates a fresh Project via `transform()`.
 * - Subsequent calls: refreshes the changed file on the cached Project, then
 *   runs the pipeline via `transformWithProject()`.
 * - On error during incremental rebuild: falls back to a full rebuild with
 *   a fresh Project.
 */
export function runRebuild(
  options: ResolvedOptions,
  cachedProject?: Project,
  changedFile?: string,
): RebuildOutcome {
  // Incremental path: reuse cached Project
  if (cachedProject && changedFile) {
    try {
      const sourceFile = cachedProject.getSourceFile(changedFile);
      if (sourceFile) {
        sourceFile.refreshFromFileSystem();
      } else {
        // New file — add it to the project
        cachedProject.addSourceFileAtPath(changedFile);
      }

      const result = transformWithProject(cachedProject, options.outputPath);
      return { success: true, result, project: cachedProject };
    } catch (error) {
      console.warn(
        '[goodie] Incremental rebuild failed, falling back to full rebuild:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // Full rebuild path
  try {
    const project = new Project({
      tsConfigFilePath: options.tsConfigPath,
    });

    if (options.include && options.include.length > 0) {
      project.addSourceFilesAtPaths(options.include);
    }

    const result = transformWithProject(project, options.outputPath);
    return { success: true, result, project };
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
