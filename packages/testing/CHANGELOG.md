# @goodie-ts/testing

## 0.3.0

### Minor Changes

- 5165e4c: Add @goodie-ts/hono for controller routing, @goodie-ts/aop for compile-time method interception, and expand the transformer plugin API with fine-grained hooks (visitClass, visitMethod, afterResolve, beforeCodegen, codegen).

### Patch Changes

- Updated dependencies [5165e4c]
  - @goodie-ts/core@0.3.0

## 0.2.0

### Minor Changes

- 69e21c1: Add `@goodie-ts/cli` package with `goodie generate` command, simplify vite-plugin, and tier 2 features.

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

  **New: `@goodie-ts/decorators`**

  - `@PostProcessor()` class decorator
  - `@Value()` config injection decorator
  - `@PostConstruct` lifecycle decorator

  **New: `@goodie-ts/testing`**

  - `withConfig()` for overriding `@Value` config in tests
  - `withDeps()` for partial factory overrides

### Patch Changes

- Updated dependencies [69e21c1]
  - @goodie-ts/core@0.2.0

## 0.1.1

### Patch Changes

- Add README to each package for npm
- Updated dependencies
  - @goodie-ts/core@0.1.1
