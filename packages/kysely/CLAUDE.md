# @goodie-ts/kysely

Kysely database integration for goodie-ts: `KyselyDatabase` library bean, `@Transactional` decorator, `TransactionManager`, `@Migration` with auto-wired `MigrationRunner`, and `CrudRepository` base class.

## Key Files

| File | Role |
|------|------|
| `src/kysely-database.ts` | `KyselyDatabase` — library-provided `@Singleton`, creates `Kysely<any>` from `DatasourceConfig` |
| `src/datasource-config.ts` | `DatasourceConfig` + `PoolConfig` — `@ConfigurationProperties('datasource')` and `@ConfigurationProperties('datasource.pool')` |
| `src/dialect.ts` | `Dialect` type (`'postgres' \| 'mysql' \| 'sqlite'`) and `supportsReturning()` |
| `src/dialect-factory.ts` | `createDialect()` — async factory using dynamic imports for `pg`, `mysql2`, `better-sqlite3` |
| `src/transaction-manager.ts` | `TransactionManager` — `AsyncLocalStorage`-based transaction propagation, `KyselyProvider` interface |
| `src/transactional-interceptor.ts` | `TransactionalInterceptor` — AOP interceptor wrapping methods in transactions (order `-40`) |
| `src/migration-runner.ts` | `MigrationRunner` — runs `@Migration` classes in sorted order via `@PostConstruct` |
| `src/abstract-migration.ts` | `AbstractMigration` — base class with `up(db)` / `down?(db)` |
| `src/crud-repository.ts` | `CrudRepository<T, DB>` — generic CRUD base class with typed `Kysely<DB>` access, multi-dialect |
| `src/kysely-transformer-plugin.ts` | `createKyselyPlugin()` — finds `KyselyDatabase` from library beans, synthesizes `TransactionManager` and interceptor |
| `src/decorators/transactional.ts` | `@Transactional({ propagation? })` — `REQUIRED` (default) or `REQUIRES_NEW` |
| `src/decorators/migration.ts` | `@Migration('name')` — marks a class as a migration with a sortable name |

## KyselyDatabase

Library-provided `@Singleton` that creates and manages a `Kysely<any>` instance:
- Depends on `DatasourceConfig` (injected via constructor)
- `@PostConstruct init()` — dynamically imports the dialect driver and creates the `Kysely` instance
- `@PreDestroy destroy()` — closes the connection pool
- Non-generic (`Kysely<any>`) — inject directly for untyped access (e.g. health checks with `sql\`SELECT 1\``)

### Typed access via CrudRepository

Subclasses of `CrudRepository<T, DB>` get typed `Kysely<DB>` access via the `this.db` getter:

```typescript
@Singleton()
class TodoRepository extends CrudRepository<Todo, Database> {
  constructor(transactionManager: TransactionManager) {
    super('todos', transactionManager);
  }

  async create(title: string): Promise<Todo> {
    return this.db  // typed Kysely<Database>
      .insertInto('todos')
      .values({ title })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
```

## DatasourceConfig + PoolConfig

Two `@ConfigurationProperties` library beans for database configuration:
- `DatasourceConfig` — `url`, `dialect` fields, prefix `datasource`
- `PoolConfig` — `min` (default 2), `max` (default 10) fields, prefix `datasource.pool`
- `DatasourceConfig` has a `@PostConstruct validate()` that checks `dialect` and `url`

Config via `config/default.json`:
```json
{ "datasource": { "url": "postgres://...", "dialect": "postgres", "pool": { "min": 2, "max": 10 } } }
```

## Multi-Dialect Support

`dialect-factory.ts` uses async `await import()` for optional peer dependencies:
- `postgres` → `pg` (`Pool` + `PostgresDialect`)
- `mysql` → `mysql2/promise` (`createPool` + `MysqlDialect`)
- `sqlite` → `better-sqlite3` (`BetterSqlite3Dialect`)

The `dialect` field in config is required (not auto-detected).

## TransactionManager

- Uses `AsyncLocalStorage` for transaction propagation across async call chains
- Constructor accepts `Kysely<any>` or a `KyselyProvider` (duck-type: object with `.kysely` property)
- When given a provider, patches `provider.kysely` with a getter that returns the active transaction
- Resolves dialect from `KyselyProvider.dialect` for `supportsReturning` support
- `runInTransaction(fn, requiresNew?)` — REQUIRED reuses existing tx, REQUIRES_NEW always starts fresh
- `startTestTransaction()` — replaces the Kysely ref with a transaction for test isolation; returns a rollback function

## Plugin Auto-Wiring

`createKyselyPlugin()` finds `KyselyDatabase` from library beans in `afterResolve` and wires:
1. `TransactionManager` singleton (depends on `KyselyDatabase`)
2. `TransactionalInterceptor` singleton (depends on `TransactionManager`)
3. `MigrationRunner` singleton with individual `@Migration` classes as constructor deps

No configuration needed — the plugin discovers `KyselyDatabase` automatically from the library beans list.

## Migration Ordering

`MigrationRunner` sorts migrations by their `@Migration('name')` string. Convention: prefix with numbers (e.g. `001_create_users`). Runs at startup via `@PostConstruct`.

## CrudRepository

`CrudRepository<T, DB>` — generic base class providing `findAll()`, `findById(id)`, `save(entity)`, `deleteById(id)`. Uses `TransactionManager.getConnection()` for transaction awareness. Uses dialect-based `supportsReturning` — PostgreSQL/SQLite use `RETURNING`; MySQL falls back to INSERT + SELECT or SELECT + DELETE.

Dual accessor pattern:
- `this.db` — returns typed `Kysely<DB>` for subclass custom queries (full type safety)
- Private `raw` getter — returns `Kysely<any>` for base class methods (dynamic table/column names)

## Gotchas

- `KyselyDatabase` is non-generic — inject it directly for untyped access (e.g. health checks), or extend `CrudRepository<T, DB>` for typed access
- Test transactions skip nested transactions to avoid Kysely's "already in transaction" error
- `CrudRepository<T, DB>` is not a bean (abstract with primitive constructor params) — import path reconciliation uses `packageDirs` fallback
- Dialect drivers (`pg`, `mysql2`, `better-sqlite3`) are optional peer dependencies — only the configured dialect needs to be installed
