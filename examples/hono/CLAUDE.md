# examples/hono

Full-stack example demonstrating goodie-ts with a Hono REST API, PostgreSQL via Kysely, and TestContainers integration tests.

## What It Demonstrates

- `@Controller` / `@Get` / `@Post` for declarative HTTP routing (codegen via hono plugin)
- `KyselyDatabase` abstract base with `PostgresKyselyDatabase` conditionally selected via `@ConditionalOnProperty`
- `PostgresDatasourceConfig` + `PoolConfig` library beans via `@Config('datasource')`
- `@Module` with `@Provides` for typed `Kysely<Database>` injection (single cast in module, no casts in consumers)
- `@Singleton` classes with constructor injection for repository and service layers
- `configDir: 'config'` in vite config for JSON-based configuration files
- `ServerConfig` from `@goodie-ts/hono` library beans (host/port via `@Config`)
- `createRouter(ctx)` pattern for testing — generates a Hono app from the DI context
- `withConfig()` testing API to override config values in integration tests
- Hono's built-in `.request()` for HTTP testing without a live server

## Architecture

```
Library beans: PostgresKyselyDatabase(@Singleton, conditional on dialect=postgres)
  ├── PostgresDatasourceConfig(@Config('datasource'))
  ├── PoolConfig(@Config('datasource.pool'))
  └── config/default.json: { "datasource": { "url": "...", "dialect": "postgres", "pool": {...} } }
│
@Module DatabaseModule(KyselyDatabase)
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
Generated: app.onStart()     → hook that starts EmbeddedServer with the router
│
Library beans: ServerConfig(@Config('server')) + EmbeddedServer(@Singleton)
  └── config/default.json: { "server": { "host": "localhost", "port": 3000 } }
```

## Key Files

| File | Role |
|------|------|
| `src/db/schema.ts` | Kysely `Database` interface with typed table definitions |
| `src/DatabaseModule.ts` | `@Module` providing typed `Kysely<Database>` from `KyselyDatabase` library bean |
| `src/DatabaseHealthIndicator.ts` | `@Singleton` health check using `KyselyDatabase` with `sql\`SELECT 1\`` |
| `src/TodoRepository.ts` | `@Singleton` repository injecting `Kysely<Database>` directly |
| `src/TodoService.ts` | `@Singleton` business logic delegating to repository |
| `src/TodoController.ts` | `@Controller('/api/todos')` with `@Get`, `@Post`, `@Patch`, `@Delete` routes |
| `src/main.ts` | Bootstrap: `await app.start()` from generated file |
| `config/default.json` | JSON config file for server, datasource, and pool settings |
| `vite.config.ts` | Vite config with `diPlugin({ configDir: 'config' })` |
| `src/AppContext.generated.ts` | **Generated** — gitignored, created by transformer + hono plugin |

## Generated File

`AppContext.generated.ts` exports:
- `__Goodie_Config` — `InjectionToken<Record<string, unknown>>` for config map
- `buildDefinitions(config?)` — factory that returns `ComponentDefinition[]` with optional config overrides
- `createContext(config?)` — async factory for testing with config overrides
- `app` — `Goodie.build(definitions)` with `onStart` hook that starts the HTTP server
- `createRouter(ctx)` — wires `@Controller` beans to Hono routes (contributed by hono plugin)

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

`createGoodieTest` accepts `buildDefinitions` (the function, not the result) so config flows through before bean construction. Custom fixtures like `app` are derived from the ApplicationContext. `app.request()` invokes routes in-process without HTTP overhead.

## Running

```bash
# Build (also regenerates AppContext.generated.ts via vite plugin)
pnpm build

# Start server (requires running PostgreSQL)
pnpm start

# Run integration tests (requires Docker)
pnpm test
```
