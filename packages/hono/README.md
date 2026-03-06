# @goodie-ts/hono

HTTP controller routing decorators for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) with [Hono](https://hono.dev).

## Install

```bash
pnpm add @goodie-ts/hono hono @hono/node-server
```

## Overview

Provides `@Controller` and HTTP method decorators (`@Get`, `@Post`, etc.) that mark classes and methods for route registration. At build time, the hono transformer plugin scans controller metadata on beans and generates a `createRouter(ctx)` function that wires controllers from the DI container to Hono routes. No runtime scanning required.

`@Controller` implicitly registers the class as a singleton bean — no need to add `@Singleton`.

The package also ships `ServerConfig` (configurable via `@ConfigurationProperties('server')`) and `EmbeddedServer` as library beans, auto-discovered at build time.

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Controller(basePath?)` | class | Marks a class as an HTTP controller (defaults to `'/'`) |
| `@Get(path?)` | method | Registers a GET route (defaults to `'/'`) |
| `@Post(path?)` | method | Registers a POST route |
| `@Put(path?)` | method | Registers a PUT route |
| `@Delete(path?)` | method | Registers a DELETE route |
| `@Patch(path?)` | method | Registers a PATCH route |

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

The hono plugin generates `createRouter` and `startServer` in `AppContext.generated.ts`:

```typescript
import { startServer } from './AppContext.generated.js';

// Starts the DI context, wires routes, and listens on configured port
await startServer();
```

Or for more control:

```typescript
import { createRouter } from './AppContext.generated.js';

const ctx = await app.start();
const router = createRouter(ctx);
// Use router.fetch for testing or pass to a custom server
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

`ServerConfig` is auto-discovered as a library bean. Configure it via a JSON config file:

```json
// config/default.json
{ "server": { "host": "localhost", "port": 3000 } }
```

Or override at startup:

```typescript
await startServer({ port: 8080 });
```

## Route Handler Return Values

| Return type | Behavior |
|------------|----------|
| `Response` | Passed through directly |
| `undefined` / `null` | Returns `204 No Content` |
| Any other value | Serialized as JSON via `c.json(result)` |

## Peer Dependencies

- `hono` >= 4.0.0
- `@hono/node-server` >= 1.0.0 (optional — only needed for `EmbeddedServer`)
- `@hono/zod-validator` >= 0.4.0 (optional — only needed for `@Validate`)
- `zod` >= 3.0.0 (optional — only needed for `@Validate`)

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
