# @goodie-ts/openapi

OpenAPI 3.1 spec generation from introspection metadata for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie).

## Install

```bash
pnpm add @goodie-ts/openapi openapi3-ts
```

## Overview

Generates an OpenAPI 3.1 specification at runtime from compile-time introspection metadata. Routes, request/response types, and validation constraints are automatically mapped to the spec. No manual schema definitions needed.

The spec is served at `/openapi.json` via the built-in `OpenApiController`.

## Decorators

| Decorator | Description |
|-----------|-------------|
| `@Schema(options)` | Custom OpenAPI metadata on `@Introspected` fields (description, example, format, enum, etc.) |
| `@ApiOperation(options)` | Operation-level metadata on route methods (summary, description, tags, deprecated) |
| `@ApiResponse(status, options)` | Custom response entries for specific status codes |

## Usage

```typescript
import { Controller, Get, Post } from '@goodie-ts/http';
import { ApiOperation, ApiResponse, Schema } from '@goodie-ts/openapi';
import { Introspected } from '@goodie-ts/core';

@Introspected()
class CreateTodoRequest {
  @Schema({ description: 'The todo title', example: 'Buy groceries' })
  accessor title!: string;
}

@Controller('/api/todos')
class TodoController {
  @Get('/')
  @ApiOperation({ summary: 'List all todos', tags: ['Todos'] })
  async getAll() {
    // ...
  }

  @Post('/')
  @ApiResponse(201, { description: 'Todo created' })
  async create(body: CreateTodoRequest) {
    // ...
  }
}
```

## Configuration

Configure via `config/default.json`:

```json
{
  "openapi": {
    "title": "My API",
    "version": "1.0.0",
    "description": "API description"
  }
}
```

## Setup

No plugin configuration needed — `@goodie-ts/openapi` ships pre-scanned components in `components.json`. The transformer auto-discovers them at build time.

## Peer Dependencies

- `@goodie-ts/core` >= 1.0.0
- `@goodie-ts/http` >= 1.0.0
- `openapi3-ts` >= 4.0.0

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
