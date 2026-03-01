# @goodie-ts/hono

HTTP controller routing decorators for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) with [Hono](https://hono.dev).

## Install

```bash
pnpm add @goodie-ts/hono hono
```

## Overview

Provides `@Controller` and HTTP method decorators (`@Get`, `@Post`, etc.) that mark classes and methods for route registration. At build time, the transformer scans these decorators and generates a `createRouter(ctx)` function that wires controllers from the DI container to Hono routes. No runtime scanning required.

`@Controller` implicitly registers the class as a singleton bean — no need to add `@Singleton`.

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

The transformer generates a `createRouter` function in `AppContext.generated.ts`:

```typescript
import { createRouter } from './AppContext.generated.js';

const ctx = await app.start();
const server = createRouter(ctx);
serve({ fetch: server.fetch, port: 3000 });
```

## Route Handler Return Values

| Return type | Behavior |
|------------|----------|
| `Response` | Passed through directly |
| `undefined` / `null` | Returns `204 No Content` |
| Any other value | Serialized as JSON via `c.json(result)` |

## Peer Dependencies

- `hono` >= 4.0.0

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
