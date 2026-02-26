import path from 'node:path';
import type { Project } from 'ts-morph';
import type { HmrContext, Plugin } from 'vite';
import type { DiPluginOptions } from './options.js';
import { type ResolvedOptions, resolveOptions } from './options.js';
import { runRebuild } from './rebuild.js';

/**
 * Vite plugin that runs the @goodie compile-time DI transformer.
 *
 * - On `buildStart`: full transform, throws on error (aborts build).
 * - On `handleHotUpdate`: incremental rebuild on `.ts` changes using a
 *   cached ts-morph Project. Falls back to full rebuild on error.
 */
export function diPlugin(userOptions?: DiPluginOptions): Plugin {
  let resolved: ResolvedOptions;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let cachedProject: Project | undefined;

  return {
    name: 'goodie',
    enforce: 'pre',

    configResolved(config) {
      resolved = resolveOptions(userOptions, config.root);
    },

    buildStart() {
      const outcome = runRebuild(resolved);
      if (outcome.success) {
        cachedProject = outcome.project;
        const count = outcome.result.beans.length;
        const warnings = outcome.result.warnings;
        console.log(
          `[goodie] Transform complete: ${count} bean(s) registered.`,
        );
        for (const w of warnings) {
          console.warn(`[goodie] Warning: ${w}`);
        }
      } else {
        throw outcome.error;
      }
    },

    handleHotUpdate(ctx: HmrContext) {
      const filePath = ctx.file;

      // Only process .ts files
      if (!filePath.endsWith('.ts')) return;

      // Skip the generated output file to prevent infinite loops
      const normalizedOutput = path.normalize(resolved.outputPath);
      const normalizedFile = path.normalize(filePath);
      if (normalizedFile === normalizedOutput) return;

      // Debounced rebuild
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }

      const { server } = ctx;
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        const outcome = runRebuild(resolved, cachedProject, filePath);
        if (outcome.success) {
          cachedProject = outcome.project;
          const count = outcome.result.beans.length;
          console.log(
            `[goodie] Rebuild complete: ${count} bean(s) registered.`,
          );
          for (const w of outcome.result.warnings) {
            console.warn(`[goodie] Warning: ${w}`);
          }
        } else {
          // On failure, invalidate cached project to force full rebuild next time
          cachedProject = undefined;
          console.error(`[goodie] Rebuild failed: ${outcome.error.message}`);
          server.ws.send({
            type: 'error',
            err: {
              message: outcome.error.message,
              stack: outcome.error.stack ?? '',
              plugin: 'goodie',
            },
          });
        }
      }, resolved.debounceMs);
    },
  };
}
