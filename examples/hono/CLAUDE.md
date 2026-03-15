# examples/hono

Full-stack example demonstrating goodie-ts with a Hono REST API, PostgreSQL via Kysely, and TestContainers integration tests.

## What It Demonstrates

- `@Controller` / `@Get` / `@Post` for declarative HTTP routing (codegen via hono plugin)
- `@Validated` + `@Introspected` DTOs with constraint decorators (`@NotBlank`, `@MaxLength`) for request body validation
- `ValiExceptionHandler` auto-discovered via `baseTokens: [ExceptionHandler]` — returns 400 with structured errors
- `KyselyDatabase` abstract base with `PostgresKyselyDatabase` conditionally selected via `@ConditionalOnProperty`
- `PostgresDatasourceConfig` + `PoolConfig` library components via `@Config('datasource')`
- `@Factory` with `@Provides` for typed `Kysely<Database>` injection (single cast in module, no casts in consumers)
- `@Singleton` classes with constructor injection for repository and service layers
- `configDir: 'config'` in vite config for JSON-based configuration files
- `ServerConfig` from `@goodie-ts/hono` library components (host/port via `@Config`)
- `createRouter(ctx)` pattern for testing — generates a Hono app from the DI context
- `withConfig()` testing API to override config values in integration tests
- Hono's built-in `.request()` for HTTP testing without a live server

## Architecture

```
Library components: PostgresKyselyDatabase(@Singleton, conditional on dialect=postgres)
  ├── PostgresDatasourceConfig(@Config('datasource'))
  ├── PoolConfig(@Config('datasource.pool'))
  └── config/default.json: { "datasource": { "url": "...", "dialect": "postgres", "pool": {...} } }
│
@Factory DatabaseModule(KyselyDatabase)
├── @Provides typedKysely(): Kysely<Database>   → typed database access (single cast here)
│
@Singleton TodoRepository(Kysely<Database>)     → fully typed Kysely queries, no casts
│
@Singleton DatabaseHealthIndicator(KyselyDatabase) → SELECT 1 health check
@Singleton TodoService(todoRepository)    → business logic layer
│
@Controller('/api/todos') TodoController(todoService) → Hono routes via decorators
│
Generated: createRouter(ctx) → wires controllers to Hono app
│
Library components: ServerConfig(@Config('server')) + EmbeddedServer(@Singleton)
  └── config/default.json: { "server": { "host": "localhost", "port": 3000 } }
```

## Key Files

| File | Role |
|------|------|
| `src/db/schema.ts` | Kysely `Database` interface with typed table definitions |
| `src/database-module.ts` | `@Factory` providing typed `Kysely<Database>` from `KyselyDatabase` library component |
| `src/database-health-indicator.ts` | `@Singleton` health check using `KyselyDatabase` with `sql\`SELECT 1\`` |
| `src/dto.ts` | `@Introspected` DTOs: `CreateTodoDto` (`@NotBlank`, `@MaxLength(255)`), `UpdateTodoDto` (`@MaxLength(255)`) |
| `src/todo-repository.ts` | `@Singleton` repository injecting `Kysely<Database>` directly |
| `src/todo-service.ts` | `@Singleton` business logic delegating to repository |
| `src/todo-controller.ts` | `@Controller('/api/todos')` with `@Validated` on `create`/`update`, `@Get`, `@Post`, `@Patch`, `@Delete` routes |
| `src/main.ts` | Bootstrap: `await app.start()` from generated file |
| `config/default.json` | JSON config file for server, datasource, and pool settings |
| `vite.config.ts` | Vite config with `diPlugin({ configDir: 'config' })` |
| `src/AppContext.generated.ts` | **Generated** — gitignored, created by transformer + hono plugin |

## Generated File

`AppContext.generated.ts` exports:
- `__Goodie_Config` — `InjectionToken<Record<string, unknown>>` for config map
- `buildDefinitions(config?)` — factory that returns `ComponentDefinition[]` with optional config overrides
- `createContext(config?)` — async factory for testing with config overrides
- `app` — `Goodie.build(definitions)` — HTTP server started by `HonoServerBootstrap` via `OnStart` lifecycle
- `createRouter(ctx)` — wires `@Controller` components to Hono routes (contributed by hono plugin)

## Test Pattern — createGoodieTest + TestContainers

```typescript
const container = await new PostgreSqlContainer('postgres:17-alpine').start();

const test = createGoodieTest(buildDefinitions, {
  config: () => ({ 'datasource.url': container.getConnectionUri() }),
  transactional: TransactionManager,
  fixtures: {
    app: (ctx) => createRouter(ctx),
  },
});

test('POST /api/todos creates a todo', async ({ app }) => {
  const res = await app.request('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Buy groceries' }),
  });
  expect(res.status).toBe(201);
});
```

`createGoodieTest` accepts `buildDefinitions` (the function, not the result) so config flows through before component construction. Custom fixtures like `app` are derived from the ApplicationContext. `app.request()` invokes routes in-process without HTTP overhead.

## Running

```bash
# Build (also regenerates AppContext.generated.ts via vite plugin)
pnpm build

# Start server (requires running PostgreSQL)
pnpm start

# Run integration tests (requires Docker)
pnpm test
```
