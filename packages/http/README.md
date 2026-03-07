# @goodie-ts/http

Framework-agnostic HTTP abstractions for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie).

## Install

```bash
pnpm add @goodie-ts/http
```

## Overview

Provides route decorators, CORS configuration, and the `HttpFilter` interface for generic middleware discovery. No runtime HTTP framework dependency — all decorators are compile-time markers (no-ops at runtime).

For Hono-specific runtime integration (`@Validate`, `EmbeddedServer`, `ServerConfig`), use `@goodie-ts/hono`.

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
import { Controller, Get, Post, Delete } from '@goodie-ts/http';
import type { Context } from 'hono';

@Controller('/api/todos')
export class TodoController {
  constructor(private todoService: TodoService) {}

  @Get('/')
  async getAll(c: Context) {
    return await this.todoService.findAll();
  }

  @Post('/')
  async create(c: Context) {
    const body = await c.req.json<{ title: string }>();
    return await this.todoService.create(body.title);
  }

  @Delete('/:id')
  async delete(c: Context) {
    await this.todoService.delete(c.req.param('id'));
  }
}
```

## HttpFilter

Generic middleware discovery mechanism. Library packages (like `@goodie-ts/security`) register `HttpFilter` beans with `baseTokens`. The HTTP runtime plugin discovers them via `ctx.getAll(HttpFilter)`, sorts by `order`, and applies as middleware.

```typescript
import { HttpFilter } from '@goodie-ts/http';
import type { HttpFilterContext } from '@goodie-ts/http';

class LoggingFilter extends HttpFilter {
  order = 0;

  middleware() {
    return async (ctx: HttpFilterContext, next: () => Promise<void>) => {
      console.log(`${ctx.methodName} called`);
      await next();
      return undefined;
    };
  }
}
```

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
