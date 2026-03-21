# @goodie-ts/cli

CLI for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) compile-time dependency injection.

## Install

```bash
pnpm add -D @goodie-ts/cli
```

**Requires Node.js >= 22.13** (for recursive `fs.watch` on Linux).

## Overview

Runs the goodie-ts transformer from the command line. Use it as a standalone code generation step, or with `--watch` for continuous rebuilds during development. This is the recommended way to integrate goodie-ts into non-Vite projects.

## Usage

```bash
# One-shot generation
goodie generate

# With library scanning and config inlining
goodie generate --scan @goodie-ts --config-dir config

# Custom paths
goodie generate --tsconfig tsconfig.app.json --output src/generated/Context.ts

# Watch mode — rebuild on .ts changes
goodie generate --watch

# Watch a specific directory
goodie generate --watch --watch-dir src
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--tsconfig` | `tsconfig.json` | Path to tsconfig.json |
| `--output` | `src/__generated__/context.ts` | Output file path |
| `--scan` | — | Comma-separated npm scopes to scan for library components (e.g. `@goodie-ts,@acme`) |
| `--config-dir` | — | Directory containing JSON config files for build-time config inlining |
| `--watch` | `false` | Watch for changes and rebuild |
| `--watch-dir` | `.` (cwd) | Directory to watch (recursive) |

## Programmatic API

```typescript
import { runTransform, logOutcome, watchAndRebuild } from '@goodie-ts/cli';

// One-shot
const outcome = runTransform({
  tsConfigPath: './tsconfig.json',
  outputPath: './src/AppContext.generated.ts',
});
logOutcome(outcome);

// Watch
const handle = watchAndRebuild({
  tsConfigPath: './tsconfig.json',
  outputPath: './src/AppContext.generated.ts',
  watchDir: './src',
});
// handle.close() to stop
```

## Library Mode

When using `--mode library`, the CLI runs `transformLibrary()` to serialize component definitions to `components.json`. If the generation produces components but your `package.json` is missing the `"goodie": { "components": "..." }` field, the CLI will warn you to add it so consumers can discover your library's components.

## package.json integration

```json
{
  "scripts": {
    "generate": "goodie generate",
    "generate:watch": "goodie generate --watch"
  }
}
```

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
