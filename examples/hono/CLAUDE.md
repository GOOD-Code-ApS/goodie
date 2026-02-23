# examples/hono

Full-stack example demonstrating goodie-ts with a Hono REST API, PostgreSQL via Drizzle ORM, and TestContainers integration tests.

## What It Demonstrates

- `@Module` + `@Provides` for wiring external infrastructure (database URL, Drizzle connection)
- `@Singleton` classes with constructor injection for repository and service layers
- Primitive token auto-wiring: `databaseUrl` parameter name matches `databaseUrl()` provider method
- Token override pattern for integration testing with TestContainers
- Hono's built-in `.request()` for HTTP testing without a live server

## Architecture

```
@Module (AppModule)
├── @Provides databaseUrl(): string             → reads DATABASE_URL env var
├── @Provides database(databaseUrl): Database   → postgres.js + drizzle, wrapped in Database class
│
@Singleton TodoRepository(database)             → Drizzle queries via database.drizzle
@Singleton TodoService(todoRepository)          → Business logic layer
│
routes.ts: createTodoRoutes(todoService)        → Hono router (plain function, not decorated)
main.ts: bootstrap DI → Hono → @hono/node-server
```

## Key Files

| File | Role |
|------|------|
| `src/db/schema.ts` | Drizzle `pgTable` definition for `todos` |
| `src/Database.ts` | Wrapper class for `PostgresJsDatabase` (clean token for DI) |
| `src/AppModule.ts` | `@Module` with `@Provides` for `databaseUrl` and `database` |
| `src/TodoRepository.ts` | `@Singleton` CRUD repository using Drizzle |
| `src/TodoService.ts` | `@Singleton` business logic delegating to repository |
| `src/routes.ts` | `createTodoRoutes()` — Hono router factory (not decorated) |
| `src/main.ts` | Bootstrap: `app.start()` → Hono → `serve()` |
| `src/AppContext.generated.ts` | **Generated** — gitignored, created by transformer |

## Generated File

`AppContext.generated.ts` exports:
- `Database_Url_Token` — `InjectionToken<string>` for the connection URI
- `definitions` — `BeanDefinition[]` array (5 beans)
- `createContext()` — async factory
- `app` — `Goodie.build(definitions)` ready to `.start()`

## Test Pattern — Token Override with TestContainers

```typescript
const container = await new PostgreSqlContainer('postgres:17-alpine').start();

const testDefs = definitions.map((d) =>
  d.token === Database_Url_Token
    ? { ...d, factory: () => container.getConnectionUri() }
    : d,
);

const ctx = await ApplicationContext.create(testDefs);
```

Tests use `honoApp.request(path, init)` — Hono's built-in test helper that invokes routes in-process without HTTP overhead.

## Design Note — Database Wrapper Class

The `Database` class wraps `PostgresJsDatabase` because the transformer cannot generate clean tokens for external library generic types (e.g., `PostgresJsDatabase<typeof schema>` resolves to file paths in identifiers). Wrapping in a local class gives the transformer a clean class token.

## Running

```bash
# Generate DI code
node scripts/generate.js

# Build
pnpm build

# Start server (requires running PostgreSQL)
DATABASE_URL=postgres://user:pass@localhost:5432/todos pnpm start

# Run integration tests (requires Docker)
pnpm test
```
