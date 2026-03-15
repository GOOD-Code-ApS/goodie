# @goodie-ts/kysely

## 1.0.0

### Major Changes

- be45d51: Multi-runtime deployment support

  - **@goodie-ts/core**: Add `@RequestScoped` decorator and `RequestScopeManager` for per-request component instances via `AsyncLocalStorage`. `ApplicationContext` supports `scope: 'request'` with automatic proxy generation for singleton->request-scoped dependencies. Conditional component evaluation (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissingComponent`) now happens at runtime in `ApplicationContext.create()` instead of at build time in the graph builder.
  - **@goodie-ts/transformer**: Add `@RequestScoped` to scanner, `@ConditionalOnProperty` `havingValue` support (single string or array matching), `CodegenContext` with build-time config passed to plugin `codegen()` hooks. Config inlining reads `default.json` at build time, removing runtime `node:fs` dependency. Config plugin now recognises `@RequestScoped` as a component decorator.
  - **@goodie-ts/hono**: Multi-runtime `EmbeddedServer` (Node, Bun, Deno). `ServerConfig` gains `runtime` field (`ServerRuntime` type: `'node' | 'bun' | 'deno'`). When `server.runtime` is `'cloudflare'`, `app.onStart()` hook and `EmbeddedServer` import are omitted from codegen — use `createRouter(ctx)` directly. Request scope middleware auto-generated when request-scoped components are present. **Breaking:** `EmbeddedServer.listen()` is now `async` — callers must `await` it.
  - **@goodie-ts/kysely**: **Breaking:** `KyselyDatabase` is now abstract with per-dialect implementations (`PostgresKyselyDatabase`, `MysqlKyselyDatabase`, `SqliteKyselyDatabase`, `NeonKyselyDatabase`, `PlanetscaleKyselyDatabase`, `LibsqlKyselyDatabase`, `D1KyselyDatabase`). Each dialect is conditionally activated via `@ConditionalOnProperty('datasource.dialect')`. Per-dialect `DatasourceConfig` classes replace the shared `DatasourceConfig`. `PoolConfig` is conditional on pooled dialects (postgres, mysql). `supportsReturning` moved from standalone function to abstract property on `KyselyDatabase`. `TransactionManager` reads `supportsReturning` from `KyselyProvider` instead of `Dialect` type. D1 dialect is `@RequestScoped` for Cloudflare Workers. Removed: `DatasourceConfig`, `ConnectionStringKyselyDatabase`, `supportsReturning()`, `CONNECTION_STRING_DIALECTS`, `validateDialect()`, `dialect-factory.ts`.
  - **@goodie-ts/cli**: Warn when `goodie generate --mode library` produces components but `package.json` is missing the `"goodie": { "components": "..." }` field. Silent when the field already exists or no components were produced.

## 0.7.0

### Minor Changes

- 5694dd0: Remove all runtime `Symbol.metadata` usage from decorators. All core decorators (`@Singleton`, `@Injectable`, `@Named`, `@Eager`, `@Module`, `@Provides`, `@Inject`, `@Optional`, `@PostConstruct`, `@PreDestroy`, `@PostProcessor`, `@Value`) are now compile-time no-ops. The `Symbol.metadata` polyfill is removed.

  **Breaking:** `META`, `setMeta`, `pushMeta`, `getClassMetadata` exports removed from `@goodie-ts/core`.

  `@Migration` now stores the migration name as a static property (`__migrationName`) instead of `Symbol.metadata`. `getMigrationName()` reads from the static property.

  `@MockDefinition` now stores its target as a static property (`__mockTarget`) instead of `Symbol.metadata`.

### Patch Changes

- Updated dependencies [5190bce]
- Updated dependencies [5694dd0]
  - @goodie-ts/core@0.10.0

## 0.6.1

### Patch Changes

- Updated dependencies [80b76ad]
  - @goodie-ts/core@0.9.0

## 0.6.0

### Minor Changes

- 7c48eb2: feat(kysely): KyselyDatabase library component, multi-dialect support, remove CrudRepository

  Added `KyselyDatabase` as a library-provided `@Singleton` that creates and manages
  a `Kysely<any>` instance from configuration. Users inject it directly for untyped
  access or use `@Module` with `@Provides` for typed `Kysely<DB>` injection.

  Added `DatasourceConfig` and `PoolConfig` as `@ConfigurationProperties` library components.
  Users configure via `config/default.json` with nested `datasource.url`, `datasource.dialect`,
  and `datasource.pool.min`/`datasource.pool.max` fields.

  Added `Dialect` type (`'postgres' | 'mysql' | 'sqlite'`) and `supportsReturning(dialect)`
  utility. Multi-dialect support via async dynamic imports for `pg`, `mysql2`, `better-sqlite3`.

  Removed `CrudRepository` — Kysely's typed query builder is already concise, making a
  CRUD base class unnecessary unlike Spring Data for JPQL. Users write queries directly.

  Simplified the kysely transformer plugin — no longer scans for database wrapper classes.
  Uses `KyselyDatabase` from library components to wire `TransactionManager` and `TransactionalInterceptor`.

  fix(transformer): @Module classes now support constructor and field injection

  `IRModule` gained `constructorDeps` and `fieldDeps`. Previously these were
  hardcoded to empty arrays, preventing modules from injecting dependencies
  via their constructors.

  fix(transformer): reconcile import paths for all library package classes

  Library components use bare package specifiers (`@goodie-ts/kysely`) in their tokenRefs,
  but ts-morph resolves user imports to absolute file paths. Added
  `reconcileLibraryImportPaths()` with `packageDirs` fallback — non-component classes
  from library packages (e.g. abstract base classes in `baseTokenRefs`) are also
  rewritten using directory-prefix matching from `discoverAll()`.

## 0.5.4

### Patch Changes

- Updated dependencies [ce2a7e9]
  - @goodie-ts/core@0.8.0

## 0.5.3

### Patch Changes

- Updated dependencies [4ca51c5]
  - @goodie-ts/core@0.7.0

## 0.5.2

### Patch Changes

- Updated dependencies [9f7daed]
  - @goodie-ts/aop@0.6.0

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
