---
"@goodie-ts/kysely": minor
"@goodie-ts/transformer": patch
---

feat(kysely): KyselyDatabase library bean, multi-dialect support, DatasourceConfig

Added `KyselyDatabase` as a library-provided `@Singleton` that creates and manages
a `Kysely<any>` instance from configuration. Users inject it directly or via a
`@Module` with `@Provides` for typed `Kysely<DB>` access.

Added `DatasourceConfig` and `PoolConfig` as `@ConfigurationProperties` library beans.
Users configure via `config/default.json` with nested `datasource.url`, `datasource.dialect`,
and `datasource.pool.min`/`datasource.pool.max` fields.

Added `Dialect` type (`'postgres' | 'mysql' | 'sqlite'`) and `supportsReturning(dialect)`
utility. Multi-dialect support via async dynamic imports for `pg`, `mysql2`, `better-sqlite3`.

Simplified the kysely transformer plugin — no longer scans for database wrapper classes.
Uses `KyselyDatabase` from library beans to wire `TransactionManager` and `TransactionalInterceptor`.

fix(transformer): @Module classes now support constructor and field injection

`IRModule` gained `constructorDeps` and `fieldDeps`. Previously these were
hardcoded to empty arrays, preventing modules from injecting dependencies
via their constructors.

fix(transformer): reconcile library bean import paths with ts-morph resolved paths

Library beans use bare package specifiers (`@goodie-ts/kysely`) in their tokenRefs,
but ts-morph resolves user imports to absolute file paths. Added
`reconcileLibraryImportPaths()` to bridge this mismatch so user beans can
depend on library beans via constructor injection.
