# @goodie-ts/testing

## 1.0.0

### Major Changes

- 8fc7032: Simplify application bootstrap: `await app.start()` is now the single entry point. The hono plugin registers an `onStart` hook to wire the router and start the HTTP server automatically. Generated route wiring now calls stable `@goodie-ts/hono` runtime helpers (`handleResult`, `securityMiddleware`, `validationMiddleware`, etc.) instead of raw Hono/hono-openapi APIs. `createGoodieTest()` now accepts a definitions factory function and supports custom fixtures derived from the ApplicationContext.

  **Breaking changes to generated code** (re-run `pnpm build` to regenerate):

  - `startServer()` removed — replaced by `await app.start()`
  - `createApp()` removed — replaced by `app.start()` which returns the `ApplicationContext`
  - `export { definitions }` removed — use `buildDefinitions()` instead

## 0.6.0

### Minor Changes

- 5694dd0: Remove all runtime `Symbol.metadata` usage from decorators. All core decorators (`@Singleton`, `@Injectable`, `@Named`, `@Eager`, `@Module`, `@Provides`, `@Inject`, `@Optional`, `@PostConstruct`, `@PreDestroy`, `@PostProcessor`, `@Value`) are now compile-time no-ops. The `Symbol.metadata` polyfill is removed.

  **Breaking:** `META`, `setMeta`, `pushMeta`, `getClassMetadata` exports removed from `@goodie-ts/core`.

  `@Migration` now stores the migration name as a static property (`__migrationName`) instead of `Symbol.metadata`. `getMigrationName()` reads from the static property.

  `@MockDefinition` now stores its target as a static property (`__mockTarget`) instead of `Symbol.metadata`.

### Patch Changes

- Updated dependencies [5190bce]
- Updated dependencies [5694dd0]
  - @goodie-ts/core@0.10.0

## 0.5.6

### Patch Changes

- Updated dependencies [80b76ad]
  - @goodie-ts/core@0.9.0

## 0.5.5

### Patch Changes

- Updated dependencies [ce2a7e9]
  - @goodie-ts/core@0.8.0
  - @goodie-ts/kysely@0.5.4

## 0.5.4

### Patch Changes

- Updated dependencies [4ca51c5]
  - @goodie-ts/core@0.7.0
  - @goodie-ts/kysely@0.5.3

## 0.5.3

### Patch Changes

- Updated dependencies [cc600d7]
- Updated dependencies [c77e195]
  - @goodie-ts/core@0.6.0
  - @goodie-ts/kysely@0.5.2

## 0.5.2

### Patch Changes

- 124bb16: Add library component discovery via `components.json` manifests and `transformLibrary()` pipeline. Support abstract class tokens in DI container. Replace `workspace:*` with `workspace:^` for proper semver ranges on publish.
- Updated dependencies [124bb16]
  - @goodie-ts/core@0.5.2
  - @goodie-ts/kysely@0.5.2

## 0.5.1

### Patch Changes

- Add README.md and CLAUDE.md documentation for all framework packages (aop, cache, config, logging, resilience, kysely). Update root and decorators docs to reflect full package set. Fix changesets config to prevent peer dependency bumps from triggering major version changes.
- Updated dependencies
  - @goodie-ts/core@0.5.1
  - @goodie-ts/kysely@0.5.1

## 0.4.0

### Minor Changes

- Add framework packages: logging, cache, config, resilience, and kysely.

  - **@goodie-ts/logging**: `@Log` decorator, `LoggerFactory` static API, `MDC` mapped diagnostic context
  - **@goodie-ts/cache**: `@Cacheable`, `@CacheEvict`, `@CachePut` with in-memory cache and stampede protection
  - **@goodie-ts/config**: `@ConfigurationProperties` for environment variable binding by prefix
  - **@goodie-ts/resilience**: `@Retryable`, `@CircuitBreaker`, `@Timeout` with exponential backoff and circuit breaker state machine
  - **@goodie-ts/kysely**: `@Transactional`, `@Migration`, `TransactionManager`, `CrudRepository`, `MigrationRunner`
  - **@goodie-ts/decorators**: Add `@Value`, `@PostConstruct`, `@PreDestroy`, `@PostProcessor`
  - **@goodie-ts/transformer**: Codegen import deduplication, plugin contribution import parsing
  - **@goodie-ts/aop**: Foundation for all interceptor-based packages

### Patch Changes

- Updated dependencies
  - @goodie-ts/core@0.4.0
  - @goodie-ts/kysely@1.0.0

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
