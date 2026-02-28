# examples/hono

Full-stack example demonstrating goodie-ts with a Hono REST API, PostgreSQL via Drizzle ORM, and TestContainers integration tests.

## What It Demonstrates

- `@Value('DATABASE_URL')` for config injection directly into a `@Singleton` class
- `@PostConstruct` for initializing infrastructure after field injection
- `@Singleton` classes with constructor injection for repository and service layers
- `withConfig()` testing API to override config values in integration tests
- Hono's built-in `.request()` for HTTP testing without a live server

## Architecture

```
@Singleton Database
├── @Value('DATABASE_URL')           → config injection (default: postgres://localhost:5432/todos)
├── @PostConstruct init()            → creates postgres.js client + drizzle instance
│
@Singleton TodoRepository(database)  → Drizzle queries via database.drizzle
@Singleton TodoService(todoRepository) → Business logic layer
│
routes.ts: createTodoRoutes(todoService)  → Hono router (plain function, not decorated)
main.ts: bootstrap DI → Hono → @hono/node-server
```

## Key Files

| File | Role |
|------|------|
| `src/db/schema.ts` | Drizzle `pgTable` definition for `todos` |
| `src/Database.ts` | `@Singleton` with `@Value('DATABASE_URL')` + `@PostConstruct` for Drizzle setup |
| `src/TodoRepository.ts` | `@Singleton` CRUD repository using Drizzle |
| `src/TodoService.ts` | `@Singleton` business logic delegating to repository |
| `src/routes.ts` | `createTodoRoutes()` — Hono router factory (not decorated) |
| `src/main.ts` | Bootstrap: `app.start()` → Hono → `serve()` |
| `src/AppContext.generated.ts` | **Generated** — gitignored, created by transformer |

## Generated File

`AppContext.generated.ts` exports:
- `__Goodie_Config` — `InjectionToken<Record<string, unknown>>` for config map
- `buildDefinitions(config?)` — factory that returns `BeanDefinition[]` with optional config overrides
- `definitions` — `buildDefinitions()` with defaults (uses `process.env`)
- `createContext(config?)` — async factory
- `createApp(config?)` — returns `Goodie.build()`
- `app` — `createApp()` ready to `.start()`

## Test Pattern — withConfig() + TestContainers

```typescript
const container = await new PostgreSqlContainer('postgres:17-alpine').start();

const ctx = await TestContext.from(definitions)
  .withConfig({ DATABASE_URL: container.getConnectionUri() })
  .build();
```

`withConfig()` merges overrides into the `__Goodie_Config` bean, so `@Value('DATABASE_URL')` on `Database` receives the TestContainers connection URI instead of `process.env.DATABASE_URL`.

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
