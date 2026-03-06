---
"@goodie-ts/kysely": minor
"@goodie-ts/transformer": patch
---

feat(kysely): KyselyDatabase library bean, multi-dialect support, CrudRepository<T, DB>

Added `KyselyDatabase` as a library-provided `@Singleton` that creates and manages
a `Kysely<any>` instance from configuration. Users inject it directly for untyped
access or extend `CrudRepository<T, DB>` for typed `Kysely<DB>` query access.

Added `DatasourceConfig` and `PoolConfig` as `@ConfigurationProperties` library beans.
Users configure via `config/default.json` with nested `datasource.url`, `datasource.dialect`,
and `datasource.pool.min`/`datasource.pool.max` fields.

Added `Dialect` type (`'postgres' | 'mysql' | 'sqlite'`) and `supportsReturning(dialect)`
utility. Multi-dialect support via async dynamic imports for `pg`, `mysql2`, `better-sqlite3`.

`CrudRepository<T, DB>` now has a second type parameter for typed database access.
Subclass custom queries use `this.db` (returns `Kysely<DB>`), while base class
methods use an internal `Kysely<any>` getter for dynamic table/column names.

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
from library packages (e.g. `CrudRepository` in `baseTokenRefs`) are also
rewritten using directory-prefix matching from `discoverAll()`.
