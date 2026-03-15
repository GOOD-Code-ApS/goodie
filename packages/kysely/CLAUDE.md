# @goodie-ts/kysely

Kysely database integration for goodie-ts: abstract `KyselyDatabase` with per-dialect implementations, `@Transactional` decorator, `TransactionManager`, `@Migration` with auto-wired `MigrationRunner`.

## Key Files

| File | Role |
|------|------|
| `src/kysely-database.ts` | `KyselyDatabase` — abstract base class with `kysely` and `supportsReturning` abstract properties |
| `src/pool-config.ts` | `PoolConfig` — `@Config('datasource.pool')`, conditional on postgres/mysql |
| `src/dialects/postgres.ts` | `PostgresDatasourceConfig` + `PostgresKyselyDatabase` — `@ConditionalOnProperty('datasource.dialect', { havingValue: 'postgres' })` |
| `src/dialects/mysql.ts` | `MysqlDatasourceConfig` + `MysqlKyselyDatabase` — conditional on `mysql` |
| `src/dialects/sqlite.ts` | `SqliteDatasourceConfig` + `SqliteKyselyDatabase` — conditional on `sqlite` |
| `src/dialects/neon.ts` | `NeonDatasourceConfig` + `NeonKyselyDatabase` — conditional on `neon` (serverless Postgres) |
| `src/dialects/planetscale.ts` | `PlanetscaleDatasourceConfig` + `PlanetscaleKyselyDatabase` — conditional on `planetscale` (serverless MySQL) |
| `src/dialects/libsql.ts` | `LibsqlDatasourceConfig` + `LibsqlKyselyDatabase` — conditional on `libsql` (Turso) |
| `src/dialects/d1.ts` | `D1DatasourceConfig` + `D1KyselyDatabase` — conditional on `d1` (Cloudflare Workers, request-scoped) |
| `src/dialect.ts` | `Dialect` type union and `DIALECTS` array |
| `src/transaction-manager.ts` | `TransactionManager` — `AsyncLocalStorage`-based transaction propagation, `KyselyProvider` interface |
| `src/transactional-interceptor.ts` | `TransactionalInterceptor` — AOP interceptor wrapping methods in transactions (order `-40`) |
| `src/migration-runner.ts` | `MigrationRunner` — runs `@Migration` classes in sorted order via `@OnInit` |
| `src/abstract-migration.ts` | `AbstractMigration` — base class with `up(db)` / `down?(db)` |
| `src/kysely-transformer-plugin.ts` | `createKyselyPlugin()` — wires `TransactionManager` via abstract `KyselyDatabase` token, synthesizes interceptor |
| `src/decorators/transactional.ts` | `@Transactional({ propagation? })` — `REQUIRED` (default) or `REQUIRES_NEW` |
| `src/decorators/migration.ts` | `@Migration('name')` — marks a class as a migration with a sortable name |

## KyselyDatabase (Per-Dialect Architecture)

Abstract base class — concrete implementations are conditionally selected at build time based on `datasource.dialect`:

- Each dialect has its own `DatasourceConfig` class with `@Config('datasource')` + `@ConditionalOnProperty`
- Each dialect has its own `KyselyDatabase` subclass with `@OnInit init()` for async driver initialization
- `supportsReturning` is an abstract property on `KyselyDatabase`, implemented per dialect
- `PoolConfig` (`datasource.pool.*`) is only active for pooled dialects (postgres, mysql)
- D1 is `@RequestScoped` (bindings come from per-request `env`), all others are `@Singleton`
- Runtime resolves the concrete impl via `baseTokenRefs` on the abstract `KyselyDatabase` token

Non-generic (`Kysely<any>`) by design. For typed access, use `@Factory` with `@Provides`:

```typescript
@Factory()
class DatabaseModule {
  constructor(private db: KyselyDatabase) {}

  @Provides()
  typedKysely(): Kysely<Database> {
    return this.db.kysely as Kysely<Database>;
  }
}

@Singleton()
class TodoRepository {
  constructor(private readonly db: Kysely<Database>) {}  // fully typed, no casts
}
```

## Per-Dialect Config

Each dialect has a typed config class with `@Config('datasource')`. Common fields are typed per dialect; the driver validates at init time and errors are wrapped with context.

Config via `config/default.json`:
```json
{ "datasource": { "url": "postgres://...", "dialect": "postgres", "pool": { "min": 2, "max": 10 } } }
```

## Multi-Dialect Support

All dialect drivers are optional peer dependencies — only the configured dialect needs to be installed:
- `postgres` → `pg` + `kysely` (`supportsReturning: true`)
- `mysql` → `mysql2/promise` + `kysely` (`supportsReturning: false`)
- `sqlite` → `better-sqlite3` + `kysely` (`supportsReturning: true`)
- `neon` → `kysely-neon` (`supportsReturning: true`)
- `planetscale` → `kysely-planetscale` (`supportsReturning: false`)
- `libsql` → `@libsql/kysely-libsql` (`supportsReturning: true`)
- `d1` → `kysely-d1` + `kysely` (`supportsReturning: true`, request-scoped)

## TransactionManager

- Uses `AsyncLocalStorage` for transaction propagation across async call chains
- Constructor accepts `Kysely<any>` or a `KyselyProvider` (duck-type: object with `.kysely` and `.supportsReturning`)
- When given a provider, patches `provider.kysely` with a getter that returns the active transaction
- Reads `supportsReturning` from the `KyselyProvider` (i.e. the `KyselyDatabase` subclass)
- `runInTransaction(fn, requiresNew?)` — REQUIRED reuses existing tx, REQUIRES_NEW always starts fresh
- `startTestTransaction()` — replaces the Kysely ref with a transaction for test isolation; returns a rollback function

## Plugin Auto-Wiring

`createKyselyPlugin()` detects any `KyselyDatabase` subclass via `baseTokenRefs` in `afterResolve` and wires:
1. `TransactionManager` singleton (depends on abstract `KyselyDatabase` token — resolved at runtime via `baseTokenRefs`)
2. `TransactionalInterceptor` singleton (depends on `TransactionManager`)
3. `MigrationRunner` singleton with individual `@Migration` classes as constructor deps

No configuration needed — the plugin discovers `KyselyDatabase` automatically from the library components list.

## Migration Ordering

`MigrationRunner` sorts migrations by their `@Migration('name')` string. Convention: prefix with numbers (e.g. `001_create_users`). Runs at startup via `@OnInit`.

## Gotchas

- `KyselyDatabase` is abstract and non-generic — inject for untyped access, or use `@Factory` + `@Provides` for typed `Kysely<DB>`
- Concrete dialect selection happens at build time via `@ConditionalOnProperty` — requires `configDir` to be set (e.g. via vite plugin)
- Test transactions skip nested transactions to avoid Kysely's "already in transaction" error
- Dialect drivers are optional peer dependencies — only the configured dialect needs to be installed
- D1 is the only request-scoped dialect; all others are singletons
