---
"@goodie-ts/cli": minor
"@goodie-ts/core": minor
"@goodie-ts/decorators": minor
"@goodie-ts/transformer": minor
"@goodie-ts/vite-plugin": minor
"@goodie-ts/testing": minor
---

Add `@goodie-ts/cli` package with `goodie generate` command, simplify vite-plugin, and tier 2 features.

**New: `@goodie-ts/cli`**
- `goodie generate` command with `--tsconfig`, `--output`, `--watch`, and `--watch-dir` flags
- Programmatic API: `runTransform()`, `logOutcome()`, `watchAndRebuild()`
- Requires Node >= 22.13 for recursive file watching on Linux

**Breaking: `@goodie-ts/transformer`**
- Removed `transformWithProject()` — use `transform()` instead

**Breaking: `@goodie-ts/vite-plugin`**
- Removed incremental rebuild logic (cached ts-morph Projects)
- Removed `ts-morph` as a direct dependency
- Full rebuild on every HMR trigger (simpler, no stale state)

**New: `@goodie-ts/core`**
- `@PostProcessor` support in ApplicationContext
- `withDeps()` partial test overrides

**New: `@goodie-ts/decorators`**
- `@PostProcessor()` class decorator
- `@Value()` config injection decorator
- `@PostConstruct` lifecycle decorator

**New: `@goodie-ts/testing`**
- `withConfig()` for overriding `@Value` config in tests
- `withDeps()` for partial factory overrides
