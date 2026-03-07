# @goodie-ts/core

## 0.10.0

### Minor Changes

- 5190bce: feat: conditional bean registration with @ConditionalOnEnv, @ConditionalOnProperty, and @ConditionalOnMissingBean

  Adds three new decorators for conditionally including or excluding beans at compile time:

  - `@ConditionalOnEnv(envVar, value?)` -- include bean only when an environment variable is set (optionally matching a specific value)
  - `@ConditionalOnProperty(key, value?)` -- include bean only when a config property exists (optionally matching a specific value)
  - `@ConditionalOnMissingBean(Token)` -- include bean only when no other bean provides the given token (useful for default implementations)

  Conditions are evaluated during graph building with AND semantics when multiple decorators are applied. The graph builder filters in order: env -> property -> missingBean. Error messages include hints when a required dependency was filtered out by a condition.

- 5694dd0: Remove all runtime `Symbol.metadata` usage from decorators. All core decorators (`@Singleton`, `@Injectable`, `@Named`, `@Eager`, `@Module`, `@Provides`, `@Inject`, `@Optional`, `@PostConstruct`, `@PreDestroy`, `@PostProcessor`, `@Value`) are now compile-time no-ops. The `Symbol.metadata` polyfill is removed.

  **Breaking:** `META`, `setMeta`, `pushMeta`, `getClassMetadata` exports removed from `@goodie-ts/core`.

  `@Migration` now stores the migration name as a static property (`__migrationName`) instead of `Symbol.metadata`. `getMigrationName()` reads from the static property.

  `@MockDefinition` now stores its target as a static property (`__mockTarget`) instead of `Symbol.metadata`.

## 0.9.0

### Minor Changes

- 80b76ad: Add `@goodie-ts/security` package for declarative authentication and authorization. Introduces `@Secured()`, `@Anonymous()`, `SecurityProvider`, and `SecurityHttpFilter`.

  Add compile-time `DecoratorMetadata` infrastructure. The transformer records class and method decorators (with resolved import paths) on `IRBeanDefinition`. `HttpFilterContext` now carries `classDecorators` and `methodDecorators` arrays instead of runtime `Symbol.metadata`. The hono plugin generates static decorator metadata at build time — no runtime `Symbol.metadata` needed for security checks. `@Secured()` and `@Anonymous()` are compile-time markers (no-ops at runtime).

  `DecoratorEntry` type exported from `@goodie-ts/core`. `IRDecoratorEntry` and `methodDecorators` added to transformer IR.

  **Breaking:** All HTTP decorators (`@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`) are now compile-time no-ops — they no longer write to `Symbol.metadata`. `HTTP_META`, `HONO_META`, `ControllerMetadata`, and `RouteMetadata` exports removed. `HttpFilterContext.routeMetadata` replaced with `classDecorators`/`methodDecorators`. `@goodie-ts/hono` no longer re-exports decorators from `@goodie-ts/http` — import generic HTTP decorators (`@Controller`, `@Get`, `@Post`, etc.) from `@goodie-ts/http` directly. Only Hono-specific exports (`@Validate`, `@Cors`, `EmbeddedServer`, `ServerConfig`) remain in `@goodie-ts/hono`. `@Cors` moved from `@goodie-ts/http` to `@goodie-ts/hono` (tied to `hono/cors` middleware). At `0.x` semver, minor bumps may contain breaking changes.

## 0.8.1

### Patch Changes

- 2002163: feat(core): runtime startup metrics gated behind GOODIE_DEBUG=true

## 0.8.0

### Minor Changes

- ce2a7e9: feat(core,transformer): JSON config file support via configDir option

  - `loadConfigFiles(dir, env?)` reads `default.json` and `{env}.json`, flattens nested keys to dot-separated strings
  - `flattenObject()` utility for nested object → flat string map conversion
  - `configDir` option in `TransformOptions` generates code that loads config files at startup
  - Priority: file defaults < env file < process.env < explicit config param

## 0.7.0

### Minor Changes

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

## 0.6.0

### Minor Changes

- cc600d7: feat: add @goodie-ts/events and @goodie-ts/scheduler packages

  Events: ApplicationEventListener abstract class pattern with compile-time discovery, EventBus with sequential async dispatch and O(1) routing, EventPublisher injection token.

  Scheduler: @Scheduled decorator for cron/fixedRate/fixedDelay with compile-time discovery, overlap prevention, graceful shutdown, lifecycle integration.

  Core: ApplicationContext self-registration as a bean for constructor injection by framework services.

  Transformer: plugin system hooks (visitClass, visitMethod, beforeCodegen) for events and scheduler plugins.

### Patch Changes

- c77e195: perf: build-time and runtime performance optimizations

  Transformer:

  - Merge scan + plugin visitors into a single AST pass (eliminates double traversal)
  - Skip .d.ts and node_modules files in scanner
  - IR hash to skip codegen when DI graph is unchanged (watch mode optimization)
  - Memoize type resolution (getType/getSymbol/getDeclarations cache)
  - Single lifecycle method pass (merge @PreDestroy + @PostConstruct scanning)
  - Merge codegen collection passes into one iteration
  - Merge filesystem discovery (plugins + library manifests in single scan)
  - Cache filesystem discovery for watch mode (discoveryCache option)
  - Generator-based getAllDependencies (avoids intermediate array allocations)
  - Memoize computeRelativeImport in codegen
  - Pass pre-computed IR hash to avoid double SHA-256 computation

  Core:

  - Add preSorted option to ApplicationContext.create() to skip redundant topoSort (generated code is already topologically sorted)

## 0.5.2

### Patch Changes

- 124bb16: Add library bean discovery via `beans.json` manifests and `transformLibrary()` pipeline. Support abstract class tokens in DI container. Replace `workspace:*` with `workspace:^` for proper semver ranges on publish.

## 0.5.1

### Patch Changes

- Add README.md and CLAUDE.md documentation for all framework packages (aop, cache, config, logging, resilience, kysely). Update root and decorators docs to reflect full package set. Fix changesets config to prevent peer dependency bumps from triggering major version changes.

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

## 0.3.0

### Minor Changes

- 5165e4c: Add @goodie-ts/hono for controller routing, @goodie-ts/aop for compile-time method interception, and expand the transformer plugin API with fine-grained hooks (visitClass, visitMethod, afterResolve, beforeCodegen, codegen).

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

## 0.1.1

### Patch Changes

- Add README to each package for npm
