# @goodie-ts/http

Abstract HTTP layer for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie). Framework-agnostic controllers, route decorators, and typed request/response abstractions.

## Install

```bash
pnpm add @goodie-ts/http
```

## Overview

Provides the HTTP abstractions that adapters (like `@goodie-ts/hono`) build on. The transformer plugin scans `@Controller` classes at build time and generates route metadata — no runtime scanning.

`@Controller` implicitly registers the class as a singleton component — no need to add `@Singleton`.

## Decorators

| Decorator | Description |
|-----------|-------------|
| `@Controller(basePath)` | Marks a class as an HTTP controller with a base path |
| `@Get(path)` | HTTP GET route |
| `@Post(path)` | HTTP POST route |
| `@Put(path)` | HTTP PUT route |
| `@Delete(path)` | HTTP DELETE route |
| `@Patch(path)` | HTTP PATCH route |
| `@Status(code)` | Sets a default response status code on a route method |

## Usage

```typescript
import { Controller, Get, Post, Delete, Status, Response } from '@goodie-ts/http';

@Controller('/api/todos')
class TodoController {
  @Get('/')
  async getAll() {
    return this.todoService.findAll();
  }

  @Post('/')
  @Status(201)
  async create(body: CreateTodoRequest) {
    return this.todoService.create(body);
  }

  @Delete('/:id')
  async delete(id: string) {
    await this.todoService.delete(id);
    return Response.noContent();
  }
}
```

## Parameter Binding

Controller method parameters are bound automatically using implicit binding:

| Parameter type | Binding |
|---------------|---------|
| Path variable (name matches route param) | Path parameter |
| Primitive type | Query parameter |
| `HttpContext` | Per-request context (headers, cookies, query, params, URL) |
| Non-primitive type (POST/PUT/PATCH) | Request body |

## Response Types

| Return type | Behavior |
|------------|----------|
| `Response<T>` | Typed response with status, headers, and body |
| `undefined` / `null` | 204 No Content |
| Any other value | Serialized as JSON with 200 OK (or `@Status` code) |

`Response<T>` provides static factories: `ok()`, `created()`, `noContent()`, `status()`, and a fluent `.header()` method.

## Extension Points

| Abstract class | Purpose |
|---------------|---------|
| `ExceptionHandler` | Maps exceptions to HTTP responses |
| `HttpServerFilter` | ANT-style pattern-matched middleware |
| `BodyValidator` | Hook for body validation before controller invocation |
| `AbstractServerBootstrap` | Base for adapter-specific server startup |

## Peer Dependencies

- `@goodie-ts/core` >= 1.0.0

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
