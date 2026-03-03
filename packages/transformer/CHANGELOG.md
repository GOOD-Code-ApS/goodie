# @goodie-ts/transformer

## 0.6.0

### Minor Changes

- 3b1e6f5: Release all packages at v0.5.0. Adds `@goodie-ts/health` package with `HealthIndicator`, `HealthAggregator`, and `UptimeHealthIndicator`. Introduces collection injection via `baseTokens` in core, `beforeScan` plugin hook for watch-mode compatibility, and a generic `buildInterceptorChain<F>` signature that preserves method types.

### Patch Changes

- Updated dependencies [3b1e6f5]
  - @goodie-ts/core@0.6.0

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
