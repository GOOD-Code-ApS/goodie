# @goodie-ts/cli

## 2.1.0

### Minor Changes

- 23e0604: Add Cloudflare Workers runtime support.

  - **`@goodie-ts/cli`**: Add `--config-dir` flag to `goodie generate` for build-time config inlining without requiring Vite. Enables Cloudflare Workers projects to use the CLI directly with Wrangler.
  - **`@goodie-ts/hono`**: Pre-initialize async request-scoped components (e.g. `D1KyselyDatabase`) at the start of each request in `createHonoRouter`. Fixes `AsyncComponentNotReadyError` when scoped proxies resolve synchronously against components with async `@OnInit`.
  - **`@goodie-ts/kysely`**: Inline `await import()` calls in `D1KyselyDatabase` with static string specifiers so Cloudflare Workers bundlers (esbuild) can statically resolve `kysely` and `kysely-d1`.

## 2.0.0

### Major Changes

- eb93812: Rename Java-isms to TS-native terminology. `BeanDefinition` → `ComponentDefinition`, `@Bean` → `@Component`, `getBean()` → `get()`, `getAll()` replaces bean collection methods, and similar renames throughout the API surface. This is a breaking change for all packages.
- eb93812: Unified `__generated__/` folder replaces per-package generated files. All generated code now lives in a single `__generated__/` directory with compile-time body validation for HTTP request types.

### Patch Changes

- Updated dependencies [eb93812]
- Updated dependencies [eb93812]
- Updated dependencies [eb93812]
- Updated dependencies [eb93812]
  - @goodie-ts/transformer@2.0.0

## 1.0.0

### Major Changes

- be45d51: Multi-runtime deployment support

  - **@goodie-ts/core**: Add `@RequestScoped` decorator and `RequestScopeManager` for per-request component instances via `AsyncLocalStorage`. `ApplicationContext` supports `scope: 'request'` with automatic proxy generation for singleton->request-scoped dependencies. Conditional component evaluation (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissingComponent`) now happens at runtime in `ApplicationContext.create()` instead of at build time in the graph builder.
  - **@goodie-ts/transformer**: Add `@RequestScoped` to scanner, `@ConditionalOnProperty` `havingValue` support (single string or array matching), `CodegenContext` with build-time config passed to plugin `codegen()` hooks. Config inlining reads `default.json` at build time, removing runtime `node:fs` dependency. Config plugin now recognises `@RequestScoped` as a component decorator.
  - **@goodie-ts/hono**: Multi-runtime `EmbeddedServer` (Node, Bun, Deno). `ServerConfig` gains `runtime` field (`ServerRuntime` type: `'node' | 'bun' | 'deno'`). When `server.runtime` is `'cloudflare'`, `app.onStart()` hook and `EmbeddedServer` import are omitted from codegen — use `createRouter(ctx)` directly. Request scope middleware auto-generated when request-scoped components are present. **Breaking:** `EmbeddedServer.listen()` is now `async` — callers must `await` it.
  - **@goodie-ts/kysely**: **Breaking:** `KyselyDatabase` is now abstract with per-dialect implementations (`PostgresKyselyDatabase`, `MysqlKyselyDatabase`, `SqliteKyselyDatabase`, `NeonKyselyDatabase`, `PlanetscaleKyselyDatabase`, `LibsqlKyselyDatabase`, `D1KyselyDatabase`). Each dialect is conditionally activated via `@ConditionalOnProperty('datasource.dialect')`. Per-dialect `DatasourceConfig` classes replace the shared `DatasourceConfig`. `PoolConfig` is conditional on pooled dialects (postgres, mysql). `supportsReturning` moved from standalone function to abstract property on `KyselyDatabase`. `TransactionManager` reads `supportsReturning` from `KyselyProvider` instead of `Dialect` type. D1 dialect is `@RequestScoped` for Cloudflare Workers. Removed: `DatasourceConfig`, `ConnectionStringKyselyDatabase`, `supportsReturning()`, `CONNECTION_STRING_DIALECTS`, `validateDialect()`, `dialect-factory.ts`.
  - **@goodie-ts/cli**: Warn when `goodie generate --mode library` produces components but `package.json` is missing the `"goodie": { "components": "..." }` field. Silent when the field already exists or no components were produced.

### Patch Changes

- Updated dependencies [9e54e65]
- Updated dependencies [be45d51]
- Updated dependencies [8fc7032]
  - @goodie-ts/transformer@1.0.0

## 0.6.6

### Patch Changes

- Updated dependencies [5190bce]
- Updated dependencies [60c7a23]
  - @goodie-ts/transformer@0.12.0

## 0.6.5

### Patch Changes

- Updated dependencies [80b76ad]
  - @goodie-ts/transformer@0.11.0

## 0.6.4

### Patch Changes

- Updated dependencies [4e7ae76]
- Updated dependencies [f793885]
  - @goodie-ts/transformer@0.10.0

## 0.6.3

### Patch Changes

- Updated dependencies [ce2a7e9]
- Updated dependencies [ce2a7e9]
- Updated dependencies [ce2a7e9]
  - @goodie-ts/transformer@0.9.0

## 0.6.2

### Patch Changes

- Updated dependencies [4ca51c5]
  - @goodie-ts/transformer@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [cc600d7]
- Updated dependencies [3b40073]
- Updated dependencies [c77e195]
  - @goodie-ts/transformer@0.7.0

## 0.6.0

### Minor Changes

- 9f7daed: Add `createAopDecorator()` API for defining AOP decorators with compile-time config via TypeScript type parameters. Migrate logging, cache, and resilience decorators from hand-written `goodie.aop` JSON to source-level `createAopDecorator<{...}>()` calls. Remove redundant transformer plugins from logging, cache, resilience, and health packages — components are now shipped via `components.json` manifests and AOP config is extracted automatically by the transformer's AOP scanner.

  Auto-discover transformer plugins from installed packages via `goodie.plugin` in `package.json`. The `discoverPlugins()` function now respects `scanScopes`, matching the behavior of library component discovery. Consumers no longer need to manually list plugins.

  **Breaking:** `createHealthPlugin`, `createLoggingPlugin`, `createCachePlugin`, and `createResiliencePlugin` exports have been removed. The `goodie.aop` field in `package.json` is no longer read — AOP config now lives in the `aop` section of `components.json`.

### Patch Changes

- Updated dependencies [9f7daed]
- Updated dependencies [124bb16]
  - @goodie-ts/transformer@0.6.0

## 0.5.1

### Patch Changes

- Add README.md and CLAUDE.md documentation for all framework packages (aop, cache, config, logging, resilience, kysely). Update root and decorators docs to reflect full package set. Fix changesets config to prevent peer dependency bumps from triggering major version changes.
- Updated dependencies
  - @goodie-ts/transformer@0.5.1

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

## 0.3.0

### Minor Changes

- 5165e4c: Add @goodie-ts/hono for controller routing, @goodie-ts/aop for compile-time method interception, and expand the transformer plugin API with fine-grained hooks (visitClass, visitMethod, afterResolve, beforeCodegen, codegen).

### Patch Changes

- Updated dependencies [5165e4c]
  - @goodie-ts/transformer@0.3.0

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
  - @goodie-ts/transformer@0.2.0
