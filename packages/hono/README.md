# @goodie-ts/hono

HTTP controller routing decorators for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) with [Hono](https://hono.dev).

## Install

```bash
pnpm add @goodie-ts/hono hono
```

## Overview

Hono HTTP integration for goodie-ts. Provides route decorators (`@Controller`, `@Get`, `@Post`, etc.), security (`@Secured`, `@Anonymous`), OpenAPI support via `hono-openapi`, the transformer plugin for compile-time route wiring, `@Validate` for request validation, and multi-runtime `EmbeddedServer`.

The hono transformer plugin scans controller metadata on components and generates a `createRouter(ctx)` function that wires controllers from the DI container to Hono routes. No runtime scanning required.

`@Controller` implicitly registers the class as a singleton component — no need to add `@Singleton`.

The package also ships `ServerConfig` (configurable via `@ConfigurationProperties('server')`) and `EmbeddedServer` as library components, auto-discovered at build time.

## Usage

```typescript
import { Controller, Get, Post, Delete } from '@goodie-ts/hono';
import type { Context } from 'hono';

@Controller('/api/todos')
export class TodoController {
  constructor(private todoService: TodoService) {}

  @Get('/')
  async getAll(c: Context) {
    const todos = await this.todoService.findAll();
    return c.json(todos);
  }

  @Post('/')
  async create(c: Context) {
    const body = await c.req.json<{ title: string }>();
    const todo = await this.todoService.create(body.title);
    return c.json(todo, 201);
  }

  @Delete('/:id')
  async delete(c: Context) {
    await this.todoService.delete(c.req.param('id'));
    // Returning void/null produces a 204 No Content
  }
}
```

The hono plugin registers an `app.onStart()` hook that wires controllers to the HTTP server automatically:

```typescript
import { app } from './AppContext.generated.js';

// Starts the DI context, wires routes, and listens on configured port
await app.start();
```

For testing, use `createRouter` directly:

```typescript
import { createContext, createRouter } from './AppContext.generated.js';

const ctx = await createContext({ 'datasource.url': testDbUrl });
const router = createRouter(ctx);
// Use router.request() for in-process HTTP testing
```

## RPC Client (Type-Safe)

The plugin generates typed RPC clients using Hono's `hc`. Per-controller clients are generated for use with larger applications:

```typescript
// Full app client
import { createClient } from './AppContext.generated.js';

const client = createClient('http://localhost:3000');
// client.api.todos.$get(), client.api.todos.$post(), etc.
```

```typescript
// Per-controller client (better for larger apps)
import { createTodoControllerClient } from './AppContext.generated.js';

const todoClient = createTodoControllerClient('http://localhost:3000/api/todos');
// todoClient.$get(), todoClient.$post(), etc.
```

Per-controller types are also exported for custom use:

```typescript
import type { TodoControllerRoutes } from './AppContext.generated.js';
```

## Server Configuration

`ServerConfig` is auto-discovered as a library component. Configure it via a JSON config file:

```json
// config/default.json
{ "server": { "host": "localhost", "port": 3000, "runtime": "node" } }
```

### Multi-Runtime Support

`EmbeddedServer` supports multiple runtimes via `server.runtime`:

| Runtime | Serve API | Package |
|---------|-----------|---------|
| `node` (default) | `@hono/node-server` | `@hono/node-server` |
| `bun` | `Bun.serve()` | Built-in |
| `deno` | `Deno.serve()` | Built-in |

Server host/port are configured via `config/default.json` under `server.host` and `server.port`.

## Route Handler Return Values

| Return type | Behavior |
|------------|----------|
| `Response` | Passed through directly |
| `undefined` / `null` | Returns `204 No Content` |
| Any other value | Serialized as JSON via `c.json(result)` |

## Peer Dependencies

- `hono` >= 4.0.0
- `@hono/node-server` >= 1.0.0 (optional — only needed for `runtime: 'node'`)
- `zod` >= 3.0.0 (optional — only needed for `@Validate`)

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
