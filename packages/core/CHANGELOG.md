# @goodie-ts/core

## 1.1.0

### Minor Changes

- 2d62bec: Add `@Introspected` decorator and compile-time type metadata generation.

  `@Introspected()` marks value objects (DTOs, request/response types) for compile-time field metadata extraction. The built-in introspection transformer plugin scans these classes and generates `MetadataRegistry` registration code with recursive `FieldType` trees and generic `DecoratorMeta` on each field. Introspected classes are NOT components — they are consumed at runtime by validation, OpenAPI, and serialization systems.

  New exports from `@goodie-ts/core`: `Introspected`, `TypeMetadata`, `IntrospectedField`, `FieldType`, `DecoratorMeta`, `MetadataRegistry`.
  New export from `@goodie-ts/transformer`: `createIntrospectionPlugin`.

## 1.0.0

### Major Changes

- 9e54e65: Improve error messages and diagnostics

  - **@goodie-ts/core**: `MissingDependencyError` now includes `requiredBy` context and an optional `hint` field. `get()`/`getAsync()`, `validateDependencies()`, and dependency resolution all suggest similar token names via Levenshtein distance ("Did you mean: UserService?"). When a component was excluded by a conditional rule (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissingComponent`), the error explains why ("component exists but was excluded by: @ConditionalOnProperty('datasource.dialect', 'postgres') — property is 'mysql'"). `@PostConstruct` and `@PreDestroy` errors include component name and method with `{ cause }` chaining.
  - **@goodie-ts/transformer**: `MissingProviderError` now includes fuzzy matching suggestions ("Did you mean: UserService?"). Plugin hook errors are wrapped with plugin name context and preserve the original error via `{ cause }`. `GOODIE_DEBUG=true` prints the full component graph, resolution order, active plugins, and codegen contributions during build.

- be45d51: Multi-runtime deployment support

  - **@goodie-ts/core**: Add `@RequestScoped` decorator and `RequestScopeManager` for per-request component instances via `AsyncLocalStorage`. `ApplicationContext` supports `scope: 'request'` with automatic proxy generation for singleton->request-scoped dependencies. Conditional component evaluation (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissingComponent`) now happens at runtime in `ApplicationContext.create()` instead of at build time in the graph builder.
  - **@goodie-ts/transformer**: Add `@RequestScoped` to scanner, `@ConditionalOnProperty` `havingValue` support (single string or array matching), `CodegenContext` with build-time config passed to plugin `codegen()` hooks. Config inlining reads `default.json` at build time, removing runtime `node:fs` dependency. Config plugin now recognises `@RequestScoped` as a component decorator.
  - **@goodie-ts/hono**: Multi-runtime `EmbeddedServer` (Node, Bun, Deno). `ServerConfig` gains `runtime` field (`ServerRuntime` type: `'node' | 'bun' | 'deno'`). When `server.runtime` is `'cloudflare'`, `app.onStart()` hook and `EmbeddedServer` import are omitted from codegen — use `createRouter(ctx)` directly. Request scope middleware auto-generated when request-scoped components are present. **Breaking:** `EmbeddedServer.listen()` is now `async` — callers must `await` it.
  - **@goodie-ts/kysely**: **Breaking:** `KyselyDatabase` is now abstract with per-dialect implementations (`PostgresKyselyDatabase`, `MysqlKyselyDatabase`, `SqliteKyselyDatabase`, `NeonKyselyDatabase`, `PlanetscaleKyselyDatabase`, `LibsqlKyselyDatabase`, `D1KyselyDatabase`). Each dialect is conditionally activated via `@ConditionalOnProperty('datasource.dialect')`. Per-dialect `DatasourceConfig` classes replace the shared `DatasourceConfig`. `PoolConfig` is conditional on pooled dialects (postgres, mysql). `supportsReturning` moved from standalone function to abstract property on `KyselyDatabase`. `TransactionManager` reads `supportsReturning` from `KyselyProvider` instead of `Dialect` type. D1 dialect is `@RequestScoped` for Cloudflare Workers. Removed: `DatasourceConfig`, `ConnectionStringKyselyDatabase`, `supportsReturning()`, `CONNECTION_STRING_DIALECTS`, `validateDialect()`, `dialect-factory.ts`.
  - **@goodie-ts/cli**: Warn when `goodie generate --mode library` produces components but `package.json` is missing the `"goodie": { "components": "..." }` field. Silent when the field already exists or no components were produced.

- 8fc7032: Simplify application bootstrap: `await app.start()` is now the single entry point. The hono plugin registers an `onStart` hook to wire the router and start the HTTP server automatically. Generated route wiring now calls stable `@goodie-ts/hono` runtime helpers (`handleResult`, `securityMiddleware`, `validationMiddleware`, etc.) instead of raw Hono/hono-openapi APIs. `createGoodieTest()` now accepts a definitions factory function and supports custom fixtures derived from the ApplicationContext.

  **Breaking changes to generated code** (re-run `pnpm build` to regenerate):

  - `startServer()` removed — replaced by `await app.start()`
  - `createApp()` removed — replaced by `app.start()` which returns the `ApplicationContext`
  - `export { definitions }` removed — use `buildDefinitions()` instead

## 0.10.0

### Minor Changes

- 5190bce: feat: conditional component registration with @ConditionalOnEnv, @ConditionalOnProperty, and @ConditionalOnMissingComponent

  Adds three new decorators for conditionally including or excluding components at compile time:

  - `@ConditionalOnEnv(envVar, value?)` -- include component only when an environment variable is set (optionally matching a specific value)
  - `@ConditionalOnProperty(key, value?)` -- include component only when a config property exists (optionally matching a specific value)
  - `@ConditionalOnMissingComponent(Token)` -- include component only when no other component provides the given token (useful for default implementations)

  Conditions are evaluated during graph building with AND semantics when multiple decorators are applied. The graph builder filters in order: env -> property -> missingComponent. Error messages include hints when a required dependency was filtered out by a condition.

- 5694dd0: Remove all runtime `Symbol.metadata` usage from decorators. All core decorators (`@Singleton`, `@Injectable`, `@Named`, `@Eager`, `@Module`, `@Provides`, `@Inject`, `@Optional`, `@PostConstruct`, `@PreDestroy`, `@PostProcessor`, `@Value`) are now compile-time no-ops. The `Symbol.metadata` polyfill is removed.

  **Breaking:** `META`, `setMeta`, `pushMeta`, `getClassMetadata` exports removed from `@goodie-ts/core`.

  `@Migration` now stores the migration name as a static property (`__migrationName`) instead of `Symbol.metadata`. `getMigrationName()` reads from the static property.

  `@MockDefinition` now stores its target as a static property (`__mockTarget`) instead of `Symbol.metadata`.

## 0.9.0

### Minor Changes

- 80b76ad: Add `@goodie-ts/security` package for declarative authentication and authorization. Introduces `@Secured()`, `@Anonymous()`, `SecurityProvider`, and `SecurityHttpFilter`.

  Add compile-time `DecoratorMetadata` infrastructure. The transformer records class and method decorators (with resolved import paths) on `IRComponentDefinition`. `HttpFilterContext` now carries `classDecorators` and `methodDecorators` arrays instead of runtime `Symbol.metadata`. The hono plugin generates static decorator metadata at build time — no runtime `Symbol.metadata` needed for security checks. `@Secured()` and `@Anonymous()` are compile-time markers (no-ops at runtime).

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

  Core: ApplicationContext self-registration as a component for constructor injection by framework services.

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

- 124bb16: Add library component discovery via `components.json` manifests and `transformLibrary()` pipeline. Support abstract class tokens in DI container. Replace `workspace:*` with `workspace:^` for proper semver ranges on publish.

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
