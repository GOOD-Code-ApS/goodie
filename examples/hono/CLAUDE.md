# examples/hono

Full-stack example demonstrating goodie-ts with a Hono REST API, PostgreSQL via Kysely, and TestContainers integration tests.

## What It Demonstrates

- `@Controller` / `@Get` / `@Post` for declarative HTTP routing (codegen via hono plugin)
- `KyselyDatabase` library bean from `@goodie-ts/kysely` for database connectivity
- `DatasourceConfig` / `PoolConfig` library beans via `@ConfigurationProperties('datasource')`
- `CrudRepository<T, DB>` — typed base class for CRUD operations with `Kysely<DB>` access
- `@Singleton` classes with constructor injection for repository and service layers
- `configDir: 'config'` in vite config for JSON-based configuration files
- `ServerConfig` from `@goodie-ts/hono` library beans (host/port via `@ConfigurationProperties`)
- `createRouter(ctx)` pattern for testing — generates a Hono app from the DI context
- `withConfig()` testing API to override config values in integration tests
- Hono's built-in `.request()` for HTTP testing without a live server

## Architecture

```
Library beans: KyselyDatabase(@Singleton) ← DatasourceConfig ← PoolConfig
  └── config/default.json: { "datasource": { "url": "...", "dialect": "postgres", "pool": {...} } }
│
@Singleton TodoRepository extends CrudRepository<Todo, Database>
├── Inherits findAll(), findById(), save(), deleteById() from base class
├── Custom queries via this.db (typed Kysely<Database>)
└── Injects TransactionManager (auto-wired by kysely plugin)
│
@Singleton DatabaseHealthIndicator(KyselyDatabase) → SELECT 1 health check
@Singleton TodoService(todoRepository)    → business logic layer
│
@Controller('/api/todos') TodoController(todoService) → Hono routes via decorators
│
Generated: createRouter(ctx) → wires controllers to Hono app
Generated: startServer()     → starts context + calls EmbeddedServer.listen(router)
│
Library beans: ServerConfig(@ConfigurationProperties('server')) + EmbeddedServer(@Singleton)
  └── config/default.json: { "server": { "host": "localhost", "port": 3000 } }
```

## Key Files

| File | Role |
|------|------|
| `src/db/schema.ts` | Kysely `Database` interface with typed table definitions |
| `src/DatabaseHealthIndicator.ts` | `@Singleton` health check using `KyselyDatabase` with `sql\`SELECT 1\`` |
| `src/TodoRepository.ts` | `@Singleton` extending `CrudRepository<Todo, Database>` with typed custom queries |
| `src/TodoService.ts` | `@Singleton` business logic delegating to repository |
| `src/TodoController.ts` | `@Controller('/api/todos')` with `@Get`, `@Post`, `@Patch`, `@Delete` routes |
| `src/main.ts` | Bootstrap: `startServer()` from generated file |
| `config/default.json` | JSON config file for server, datasource, and pool settings |
| `vite.config.ts` | Vite config with `diPlugin({ configDir: 'config' })` |
| `src/AppContext.generated.ts` | **Generated** — gitignored, created by transformer + hono plugin |

## Generated File

`AppContext.generated.ts` exports:
- `__Goodie_Config` — `InjectionToken<Record<string, unknown>>` for config map
- `buildDefinitions(config?)` — factory that returns `BeanDefinition[]` with optional config overrides
- `definitions` — `buildDefinitions()` with defaults (loads `config/default.json` + `process.env`)
- `createContext(config?)` — async factory
- `createApp(config?)` — returns `Goodie.build()`
- `app` — `createApp()` ready to `.start()`
- `createRouter(ctx)` — wires `@Controller` beans to Hono routes (contributed by hono plugin)
- `startServer(options?)` — starts context and calls `EmbeddedServer.listen(router)` (contributed by hono plugin)

## Test Pattern — createRouter(ctx) + TestContainers

```typescript
const container = await new PostgreSqlContainer('postgres:17-alpine').start();

const test = createGoodieTest(buildDefinitions(), {
  config: () => ({ 'datasource.url': container.getConnectionUri() }),
  transactional: TransactionManager,
});

test('POST /api/todos creates a todo', async ({ ctx }) => {
  const honoApp = createRouter(ctx);
  const res = await honoApp.request('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Buy groceries' }),
  });
  expect(res.status).toBe(201);
});
```

Tests use `createRouter(ctx)` to get a Hono app wired to the test DI context. `honoApp.request()` invokes routes in-process without HTTP overhead.

## Running

```bash
# Generate DI code
pnpm generate

# Build
pnpm build

# Start server (requires running PostgreSQL)
pnpm start

# Run integration tests (requires Docker)
pnpm test
```
