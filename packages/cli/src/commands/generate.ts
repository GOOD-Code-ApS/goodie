import fs from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import {
  logLibraryOutcome,
  logOutcome,
  runTransform,
  runTransformLibrary,
} from '../run-transform.js';
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
    mode: {
      type: 'string',
      description: 'Transform mode: "app" (default) or "library"',
      default: 'app',
    },
    'package-name': {
      type: 'string',
      description:
        'Package name for library mode (auto-detected from package.json if omitted)',
    },
    'components-output': {
      type: 'string',
      description: 'Output path for components.json in library mode',
      default: 'dist/components.json',
    },
    'code-output': {
      type: 'string',
      description:
        'Also emit generated code (e.g. for integration tests). Only used in library mode.',
    },
    scan: {
      type: 'string',
      description:
        'Comma-separated npm scopes to scan for library components (e.g. "@goodie-ts,@acme")',
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
  async run({ args }) {
    const cwd = process.cwd();
    const tsConfigPath = path.resolve(cwd, args.tsconfig);
    const outputPath = path.resolve(cwd, args.output);
    const scanScopes = args.scan
      ? args.scan.split(',').map((s: string) => s.trim())
      : undefined;

    if (args.mode === 'library') {
      const packageName = args['package-name'] ?? detectPackageName(cwd);
      const componentsOutputPath = path.resolve(cwd, args['components-output']);
      const codeOutputPath = args['code-output']
        ? path.resolve(cwd, args['code-output'])
        : undefined;

      const outcome = await runTransformLibrary({
        tsConfigPath,
        packageName,
        componentsOutputPath,
        codeOutputPath,
      });
      logLibraryOutcome(outcome);

      if (!outcome.success) {
        process.exitCode = 1;
        return;
      }

      if (outcome.result.components.length > 0) {
        warnMissingGoodieField(cwd, args['components-output']);
      }

      if (args.watch) {
        console.warn(
          '[goodie] --watch is not supported in library mode. Run without --watch.',
        );
        process.exitCode = 1;
      }
    } else {
      const outcome = await runTransform({
        tsConfigPath,
        outputPath,
        scanScopes,
      });
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
    }
  },
});

/**
 * Warn if `package.json` is missing the `"goodie": { "components": "..." }` field
 * that consumers need for automatic library component discovery.
 */
function warnMissingGoodieField(cwd: string, componentsOutput: string): void {
  const pkgJsonPath = path.join(cwd, 'package.json');
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as { goodie?: { components?: string } };
    if (pkg.goodie?.components) return; // Already configured
  } catch {
    return; // No package.json — nothing to warn about
  }
  console.warn(
    `[goodie] Warning: package.json is missing the "goodie.components" field. Consumers won't discover your library components.\n` +
      `  Add this to your package.json:\n` +
      `  "goodie": { "components": "${componentsOutput}" }`,
  );
}

function detectPackageName(cwd: string): string {
  const pkgJsonPath = path.join(cwd, 'package.json');
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    // Fall through to error
  }
  throw new Error(
    'Could not detect package name. Provide --package-name or ensure package.json exists with a "name" field.',
  );
}
