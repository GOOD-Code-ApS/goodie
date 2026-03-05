# @goodie-ts/health

## 1.0.0

### Patch Changes

- cc600d7: fix: move @goodie-ts/\* runtime dependencies to peerDependencies

  Library packages now declare @goodie-ts/\* runtime dependencies as peerDependencies
  instead of dependencies. This ensures consumers share a single copy of core packages
  like @goodie-ts/core, preventing class identity mismatches at runtime.

  Build-time tools (cli, vite-plugin, transformer) are unchanged since they don't share
  a runtime with the consumer's application.

- Updated dependencies [cc600d7]
  - @goodie-ts/decorators@1.0.0

## 0.6.0

### Minor Changes

- 9f7daed: Add `createAopDecorator()` API for defining AOP decorators with compile-time config via TypeScript type parameters. Migrate logging, cache, and resilience decorators from hand-written `goodie.aop` JSON to source-level `createAopDecorator<{...}>()` calls. Remove redundant transformer plugins from logging, cache, resilience, and health packages — beans are now shipped via `beans.json` manifests and AOP config is extracted automatically by the transformer's AOP scanner.

  Auto-discover transformer plugins from installed packages via `goodie.plugin` in `package.json`. The `discoverPlugins()` function now respects `scanScopes`, matching the behavior of library bean discovery. Consumers no longer need to manually list plugins.

  **Breaking:** `createHealthPlugin`, `createLoggingPlugin`, `createCachePlugin`, and `createResiliencePlugin` exports have been removed. The `goodie.aop` field in `package.json` is no longer read — AOP config now lives in the `aop` section of `beans.json`.

### Patch Changes

- 124bb16: Add library bean discovery via `beans.json` manifests and `transformLibrary()` pipeline. Support abstract class tokens in DI container. Replace `workspace:*` with `workspace:^` for proper semver ranges on publish.
- Updated dependencies [9f7daed]
  - @goodie-ts/decorators@0.5.2

## 0.5.1

### Patch Changes

- Add README.md and CLAUDE.md documentation for all framework packages (aop, cache, config, logging, resilience, kysely). Update root and decorators docs to reflect full package set. Fix changesets config to prevent peer dependency bumps from triggering major version changes.
