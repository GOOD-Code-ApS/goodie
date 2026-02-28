import path from 'node:path';
import { defineCommand } from 'citty';
import { logOutcome, runTransform } from '../run-transform.js';
import { watchAndRebuild } from '../watch.js';

export const generate = defineCommand({
  meta: {
    description: 'Run the goodie compile-time DI transformer',
  },
  args: {
    tsconfig: {
      type: 'string',
      description: 'Path to tsconfig.json',
      default: 'tsconfig.json',
    },
    output: {
      type: 'string',
      description: 'Output file path',
      default: 'src/AppContext.generated.ts',
    },
    watch: {
      type: 'boolean',
      description: 'Watch for changes and rebuild',
      default: false,
    },
    'watch-dir': {
      type: 'string',
      description:
        'Directory to watch (default: cwd). Requires Node >= 22.13 for recursive watching.',
    },
  },
  run({ args }) {
    const cwd = process.cwd();
    const tsConfigPath = path.resolve(cwd, args.tsconfig);
    const outputPath = path.resolve(cwd, args.output);

    // Always run an initial transform
    const outcome = runTransform({ tsConfigPath, outputPath });
    logOutcome(outcome);

    if (!outcome.success) {
      process.exitCode = 1;
      return;
    }

    if (args.watch) {
      const watchDir = args['watch-dir']
        ? path.resolve(cwd, args['watch-dir'])
        : cwd;
      console.log(
        `[goodie] Watching ${path.relative(cwd, watchDir) || '.'} for changes...`,
      );
      watchAndRebuild({
        tsConfigPath,
        outputPath,
        watchDir,
      });
    }
  },
});
