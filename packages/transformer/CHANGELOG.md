# @goodie-ts/transformer

## 0.10.0

### Minor Changes

- 4e7ae76: Remove `@Controller` from scanner's hardcoded decorator names. Plugins can now register classes as beans via `ctx.registerBean({ scope })` in their `visitClass` hook. The hono plugin uses this to register `@Controller` classes as singletons — the DI core no longer has any HTTP knowledge.

  **BREAKING:** `@Controller` is no longer recognized by the scanner without the hono plugin. Projects using `@Controller` must have `@goodie-ts/hono` installed (which was already required for route codegen).

- f793885: refactor!: unify @Module into @Singleton — @Provides is now an orthogonal capability on any bean

  - Removed `IRModule`, `ScannedModule`, `ScannedModuleImport` types
  - `@Module` classes are now scanned as regular beans (singleton scope) with `isModule` metadata
  - `@Provides` expansion happens in the resolver stage instead of graph-builder's `expandModules()`
  - Removed module imports (`@Module({ imports: [...] })`) — use constructor injection instead
  - Any bean can now have `@Provides` methods, not just `@Module` classes

### Patch Changes

- Updated dependencies [2002163]
  - @goodie-ts/core@0.8.1

## 0.9.1

### Patch Changes

- 7c48eb2: feat(kysely): KyselyDatabase library bean, multi-dialect support, remove CrudRepository

  Added `KyselyDatabase` as a library-provided `@Singleton` that creates and manages
  a `Kysely<any>` instance from configuration. Users inject it directly for untyped
  access or use `@Module` with `@Provides` for typed `Kysely<DB>` injection.

  Added `DatasourceConfig` and `PoolConfig` as `@ConfigurationProperties` library beans.
  Users configure via `config/default.json` with nested `datasource.url`, `datasource.dialect`,
  and `datasource.pool.min`/`datasource.pool.max` fields.

  Added `Dialect` type (`'postgres' | 'mysql' | 'sqlite'`) and `supportsReturning(dialect)`
  utility. Multi-dialect support via async dynamic imports for `pg`, `mysql2`, `better-sqlite3`.

  Removed `CrudRepository` — Kysely's typed query builder is already concise, making a
  CRUD base class unnecessary unlike Spring Data for JPQL. Users write queries directly.

  Simplified the kysely transformer plugin — no longer scans for database wrapper classes.
  Uses `KyselyDatabase` from library beans to wire `TransactionManager` and `TransactionalInterceptor`.

  fix(transformer): @Module classes now support constructor and field injection

  `IRModule` gained `constructorDeps` and `fieldDeps`. Previously these were
  hardcoded to empty arrays, preventing modules from injecting dependencies
  via their constructors.

  fix(transformer): reconcile import paths for all library package classes

  Library beans use bare package specifiers (`@goodie-ts/kysely`) in their tokenRefs,
  but ts-morph resolves user imports to absolute file paths. Added
  `reconcileLibraryImportPaths()` with `packageDirs` fallback — non-bean classes
  from library packages (e.g. abstract base classes in `baseTokenRefs`) are also
  rewritten using directory-prefix matching from `discoverAll()`.

## 0.9.0

### Minor Changes

- ce2a7e9: feat(hono)!: move controller scanning from transformer into hono plugin

  BREAKING CHANGE: Removed public exports from `@goodie-ts/transformer`:
  `IRControllerDefinition`, `IRRouteDefinition`, `IRRouteValidation`,
  `HttpMethod`, `ScannedController`, `ScannedRoute`, `ScannedValidation`.

  The transformer core no longer has any HTTP/controller knowledge beyond
  `@Controller` implying singleton registration. All route scanning
  (`@Get`, `@Post`, `@Validate`, etc.) now lives in the hono plugin's
  `visitClass`/`visitMethod` hooks, following the Micronaut pattern where
  HTTP processing is fully owned by the framework module.

- ce2a7e9: feat(core,transformer): JSON config file support via configDir option

  - `loadConfigFiles(dir, env?)` reads `default.json` and `{env}.json`, flattens nested keys to dot-separated strings
  - `flattenObject()` utility for nested object → flat string map conversion
  - `configDir` option in `TransformOptions` generates code that loads config files at startup
  - Priority: file defaults < env file < process.env < explicit config param

- ce2a7e9: feat(hono): extract route codegen into hono plugin, add ServerConfig and configDir support

  - Move `createRouter()`/`startServer()` code generation from transformer core into `@goodie-ts/hono` plugin, auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }`
  - Add `ServerConfig` class with `@ConfigurationProperties('server')` for host/port configuration
  - Rewrite `EmbeddedServer` as a `@Singleton` with `ServerConfig` dependency (no longer synthesized in codegen)
  - Resolver now stores controller metadata on `bean.metadata.controller` so plugins can read it
  - Remove `hono` peer dependency from `@goodie-ts/transformer` — no longer coupled
  - Add `configDir` option to `@goodie-ts/vite-plugin` for JSON config file support

### Patch Changes

- Updated dependencies [ce2a7e9]
  - @goodie-ts/core@0.8.0

## 0.8.0

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

### Patch Changes

- Updated dependencies [4ca51c5]
  - @goodie-ts/core@0.7.0

## 0.7.0

### Minor Changes

- cc600d7: feat: add @goodie-ts/events and @goodie-ts/scheduler packages

  Events: ApplicationEventListener abstract class pattern with compile-time discovery, EventBus with sequential async dispatch and O(1) routing, EventPublisher injection token.

  Scheduler: @Scheduled decorator for cron/fixedRate/fixedDelay with compile-time discovery, overlap prevention, graceful shutdown, lifecycle integration.

  Core: ApplicationContext self-registration as a bean for constructor injection by framework services.

  Transformer: plugin system hooks (visitClass, visitMethod, beforeCodegen) for events and scheduler plugins.

- 3b40073: feat(hono,transformer): request validation via @Validate

  - Add `@Validate({ json?, query?, param? })` decorator for controller methods
  - Scanner detects `@Validate`, extracts Zod schema references and import paths via ts-morph
  - Codegen emits `zValidator()` middleware from `@hono/zod-validator` before route handlers
  - Standard 400 error response with sanitized Zod issues on validation failure
  - `@hono/zod-validator` and `zod` added as optional peer dependencies
  - Hono example updated with Zod schemas for create/update todo validation

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

- Updated dependencies [cc600d7]
- Updated dependencies [c77e195]
  - @goodie-ts/core@0.6.0

## 0.6.0

### Minor Changes

- 9f7daed: Add `createAopDecorator()` API for defining AOP decorators with compile-time config via TypeScript type parameters. Migrate logging, cache, and resilience decorators from hand-written `goodie.aop` JSON to source-level `createAopDecorator<{...}>()` calls. Remove redundant transformer plugins from logging, cache, resilience, and health packages — beans are now shipped via `beans.json` manifests and AOP config is extracted automatically by the transformer's AOP scanner.

  Auto-discover transformer plugins from installed packages via `goodie.plugin` in `package.json`. The `discoverPlugins()` function now respects `scanScopes`, matching the behavior of library bean discovery. Consumers no longer need to manually list plugins.

  **Breaking:** `createHealthPlugin`, `createLoggingPlugin`, `createCachePlugin`, and `createResiliencePlugin` exports have been removed. The `goodie.aop` field in `package.json` is no longer read — AOP config now lives in the `aop` section of `beans.json`.

### Patch Changes

- 124bb16: Add library bean discovery via `beans.json` manifests and `transformLibrary()` pipeline. Support abstract class tokens in DI container. Replace `workspace:*` with `workspace:^` for proper semver ranges on publish.
- Updated dependencies [124bb16]
  - @goodie-ts/core@0.5.2

## 0.5.1

### Patch Changes

- Add README.md and CLAUDE.md documentation for all framework packages (aop, cache, config, logging, resilience, kysely). Update root and decorators docs to reflect full package set. Fix changesets config to prevent peer dependency bumps from triggering major version changes.
- Updated dependencies
  - @goodie-ts/core@0.5.1

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
