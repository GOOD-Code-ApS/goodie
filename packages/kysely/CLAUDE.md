# @goodie-ts/kysely

Kysely database integration for goodie-ts: `@Transactional` decorator, `TransactionManager`, `@Migration` with auto-wired `MigrationRunner`, and `CrudRepository` base class.

## Key Files

| File | Role |
|------|------|
| `src/transaction-manager.ts` | `TransactionManager` — `AsyncLocalStorage`-based transaction propagation, `KyselyProvider` interface |
| `src/transactional-interceptor.ts` | `TransactionalInterceptor` — AOP interceptor wrapping methods in transactions (order `-40`) |
| `src/migration-runner.ts` | `MigrationRunner` — runs `@Migration` classes in sorted order via `@PostConstruct` |
| `src/abstract-migration.ts` | `AbstractMigration` — base class with `up(db)` / `down?(db)` |
| `src/crud-repository.ts` | `CrudRepository<T>` — generic CRUD base class, multi-dialect (auto-detects `RETURNING` support) |
| `src/kysely-transformer-plugin.ts` | `createKyselyPlugin()` — scans decorators, auto-detects Kysely provider, synthesizes beans |
| `src/decorators/transactional.ts` | `@Transactional({ propagation? })` — `REQUIRED` (default) or `REQUIRES_NEW` |
| `src/decorators/migration.ts` | `@Migration('name')` — marks a class as a migration with a sortable name |

## TransactionManager

- Uses `AsyncLocalStorage` for transaction propagation across async call chains
- Constructor accepts `Kysely<any>` or a `KyselyProvider` (duck-type: object with `.kysely` property)
- When given a provider, patches `provider.kysely` with a getter that returns the active transaction
- `runInTransaction(fn, requiresNew?)` — REQUIRED reuses existing tx, REQUIRES_NEW always starts fresh
- `startTestTransaction()` — replaces the Kysely ref with a transaction for test isolation; returns a rollback function

## Plugin Auto-Wiring

`createKyselyPlugin({ database: 'ClassName' })` auto-detects the database wrapper class and wires:
1. `TransactionManager` singleton (depends on the database class)
2. `TransactionalInterceptor` singleton (depends on `TransactionManager`)
3. `MigrationRunner` singleton with individual `@Migration` classes as constructor deps

Migrations are wired as individual constructor deps (rest params), not via `baseTokens`/`getAll()` — the plugin knows the full set at compile time.

## Migration Ordering

`MigrationRunner` sorts migrations by their `@Migration('name')` string. Convention: prefix with numbers (e.g. `001_create_users`). Runs at startup via `@PostConstruct`.

## CrudRepository

Generic base class providing `findAll()`, `findById(id)`, `save(entity)`, `deleteById(id)`. Uses `TransactionManager.getConnection()` for transaction awareness. Auto-detects dialect support for `RETURNING` via `adapter.supportsReturning`. PostgreSQL uses `RETURNING`; MySQL/SQLite fall back to INSERT + SELECT or SELECT + DELETE.

## Gotchas

- `TransactionManager` must be configured before use — either via the plugin (auto) or `configure(kysely)` (manual)
- Test transactions skip nested transactions to avoid Kysely's "already in transaction" error
- `CrudRepository.db` returns `Kysely<any>` — type erasure is intentional since the transformer can't generate clean tokens for `Kysely<DB>` generics
