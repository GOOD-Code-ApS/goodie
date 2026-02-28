# @goodie-ts/cli

CLI tool that wraps `@goodie-ts/transformer` with timing, logging, watch mode, and a citty-based command interface.

## Key Files

| File | Role |
|------|------|
| `src/bin.ts` | `#!/usr/bin/env node` entry point, citty `runMain` |
| `src/commands/generate.ts` | `goodie generate` command definition with args |
| `src/run-transform.ts` | `runTransform()` + `logOutcome()` — wraps `transform()` with timing and error handling |
| `src/watch.ts` | `watchAndRebuild()` — `fs.watch` with debounce, `.ts` filter, output file exclusion |
| `src/index.ts` | Barrel exports for programmatic API |

## CLI Interface

```
goodie generate [--tsconfig path] [--output path] [--watch] [--watch-dir path]
```

- Defaults: `tsconfig.json` -> `src/AppContext.generated.ts`
- `--watch` runs an initial transform, then watches for `.ts` changes
- `--watch-dir` defaults to cwd (not output dir)

## Architecture

```
bin.ts (citty runMain)
  └── commands/generate.ts (defineCommand)
        ├── run-transform.ts  →  @goodie-ts/transformer transform()
        └── watch.ts          →  node:fs.watch + run-transform.ts
```

The CLI calls `transform()` directly (full rebuild every time). No `ts-morph` Project caching — that complexity was intentionally removed from the ecosystem.

## Return Types

`runTransform()` returns a discriminated union:
- `TransformSuccess` — `{ success: true, result: TransformResult, durationMs: number }`
- `TransformFailure` — `{ success: false, error: Error }`

`logOutcome()` handles both cases, printing bean count + timing on success, error + hint on failure.

## Watch Behavior

- Uses `fs.watch` with `{ recursive: true }` — requires Node >= 22.13 on Linux
- 100ms debounce (hardcoded, not exposed as CLI flag)
- Skips non-`.ts` files and the generated output file (prevents infinite loops)
- Returns a `WatchHandle` with `.close()` for cleanup

## Gotchas

- `engines.node >= 22.13.0` in package.json — `fs.watch` recursive support on Linux
- The generate command always runs an initial transform before entering watch mode
- Exit code 1 on transform failure (non-watch mode)
