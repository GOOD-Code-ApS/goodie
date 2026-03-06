# @goodie-ts/resilience

## 0.6.1

### Patch Changes

- 4ca51c5: Consolidate `@goodie-ts/decorators`, `@goodie-ts/aop`, and `@goodie-ts/config` into core packages.

  **BREAKING:** `@goodie-ts/decorators`, `@goodie-ts/aop`, and `@goodie-ts/config` no longer exist. All exports are now available from `@goodie-ts/core`.

  Migration: replace all imports from `@goodie-ts/decorators`, `@goodie-ts/aop`, or `@goodie-ts/config` with `@goodie-ts/core`.

  ```diff
  - import { Singleton, Inject } from '@goodie-ts/decorators';
  + import { Singleton, Inject } from '@goodie-ts/core';

  - import { createAopDecorator, Around } from '@goodie-ts/decorators';
  + import { createAopDecorator, Around } from '@goodie-ts/core';

  - import { buildInterceptorChain } from '@goodie-ts/aop';
  + import { buildInterceptorChain } from '@goodie-ts/core';

  - import { ConfigurationProperties } from '@goodie-ts/config';
  + import { ConfigurationProperties } from '@goodie-ts/core';
  ```

  AOP and config transformer plugins are now built-in to `@goodie-ts/transformer` — no need to pass them explicitly.

- Updated dependencies [4ca51c5]
  - @goodie-ts/core@0.7.0

## 0.6.0

### Minor Changes

- 9f7daed: Add `createAopDecorator()` API for defining AOP decorators with compile-time config via TypeScript type parameters. Migrate logging, cache, and resilience decorators from hand-written `goodie.aop` JSON to source-level `createAopDecorator<{...}>()` calls. Remove redundant transformer plugins from logging, cache, resilience, and health packages — beans are now shipped via `beans.json` manifests and AOP config is extracted automatically by the transformer's AOP scanner.

  Auto-discover transformer plugins from installed packages via `goodie.plugin` in `package.json`. The `discoverPlugins()` function now respects `scanScopes`, matching the behavior of library bean discovery. Consumers no longer need to manually list plugins.

  **Breaking:** `createHealthPlugin`, `createLoggingPlugin`, `createCachePlugin`, and `createResiliencePlugin` exports have been removed. The `goodie.aop` field in `package.json` is no longer read — AOP config now lives in the `aop` section of `beans.json`.

### Patch Changes

- Updated dependencies [9f7daed]
  - @goodie-ts/aop@0.6.0
  - @goodie-ts/decorators@0.5.2

## 0.5.1

### Patch Changes

- Add README.md and CLAUDE.md documentation for all framework packages (aop, cache, config, logging, resilience, kysely). Update root and decorators docs to reflect full package set. Fix changesets config to prevent peer dependency bumps from triggering major version changes.
- Updated dependencies
  - @goodie-ts/transformer@0.5.1
  - @goodie-ts/aop@0.5.1

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
  - @goodie-ts/transformer@0.4.0
  - @goodie-ts/aop@0.4.0
