# Cloudflare Workers Example

Minimal goodie-ts application running on Cloudflare Workers with D1 (SQLite).

## What It Demonstrates

- `@Controller` / `@Get` / `@Post` / `@Delete` for declarative HTTP routing
- `KyselyDatabase` with D1 dialect (request-scoped — each request gets a fresh Kysely instance)
- `@Factory` + `@Provides` for typed `Kysely<Database>` injection
- `createHonoRouter(ctx)` entry point (no `HonoServerBootstrap` — excluded on Cloudflare)
- Wrangler D1 migrations (not `@Migration` — see [note on migrations](#migrations))
- `nodejs_compat` flag for `AsyncLocalStorage` support

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (installed as dev dependency)

## Setup

```bash
# From the monorepo root
pnpm install
pnpm build

cd examples/cloudflare-workers

# Apply D1 migrations locally
pnpm wrangler d1 migrations apply goodie-example-db --local
```

## Local Development

```bash
pnpm dev
```

This runs the goodie code generator in watch mode alongside `wrangler dev`.
Changes to controllers, decorators, or config are automatically regenerated and hot-reloaded.

The server starts at `http://localhost:8787`.

### API Endpoints

```bash
# List all todos
curl http://localhost:8787/api/todos

# Create a todo
curl -X POST http://localhost:8787/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title": "Buy groceries"}'

# Get a todo by ID
curl http://localhost:8787/api/todos/1

# Delete a todo
curl -X DELETE http://localhost:8787/api/todos/1
```

## Deployment

```bash
# Create the D1 database on Cloudflare
pnpm wrangler d1 create goodie-example-db
# Update `database_id` in wrangler.toml with the returned ID

# Apply migrations to remote D1
pnpm wrangler d1 migrations apply goodie-example-db --remote

# Deploy (predeploy script runs goodie generate automatically)
pnpm deploy
```

## Architecture

```
config/default.json
  └── server.runtime: "cloudflare", datasource.dialect: "d1"

Library components (conditional):
  D1KyselyDatabase (@RequestScoped, conditional on dialect=d1)
  └── D1DatasourceConfig (@Config('datasource'), binding: "DB")

@Controller('/api/todos') TodoController(KyselyDatabase)

Entry point: src/worker.ts
  └── Goodie.build() → createHonoRouter(ctx) → export default
```

## Key Differences from Node.js Example

| Concern | Node.js (examples/hono) | Cloudflare Workers |
|---------|------------------------|--------------------|
| Entry point | `await app.start()` | `createHonoRouter(ctx)` + `export default` |
| Server | `HonoServerBootstrap` + `EmbeddedServer` | Workers runtime handles HTTP |
| Code generation | Vite plugin (`diPlugin`) | `goodie` CLI (`--config-dir`) |
| Bundling | Vite (rollup) | Wrangler (esbuild) |
| Database | PostgreSQL (singleton) | D1 (request-scoped) |
| Migrations | `@Migration` decorator | `wrangler d1 migrations` |
| Env vars | `process.env` | Per-request `env` bindings via `RequestScopeManager` |
| AsyncLocalStorage | Built-in | Requires `nodejs_compat` flag |

## Migrations

D1 migrations use Wrangler's built-in migration system (SQL files in `migrations/`) rather than the `@Migration` decorator. This is because `D1KyselyDatabase` is request-scoped — the D1 binding is only available during request handling, not at application startup when `@Migration` would run.

## Limitations

- **`@ConditionalOnEnv`** is not supported on edge runtimes. Use `@ConditionalOnProperty` with inlined config instead. See the [@ConditionalOnEnv documentation](../../packages/core/src/decorators/conditional-on-env.ts) for details.
- **`process.env`** is empty on Workers (even with `nodejs_compat`). All configuration should go through `config/*.json` files which are inlined at build time.
