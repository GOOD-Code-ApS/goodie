# @goodie-ts/kysely

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
