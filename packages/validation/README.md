# @goodie-ts/validation

Valibot-based validation from compile-time introspection metadata for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie).

## Install

```bash
pnpm add @goodie-ts/validation valibot
```

## Overview

Declarative validation using constraint decorators on `@Introspected` types. At build time, the transformer plugin generates Valibot schemas from type metadata. At runtime, the `ValidationInterceptor` validates method parameters automatically.

## Constraint Decorators

| Decorator | Description |
|-----------|-------------|
| `@MinLength(n)` | Minimum string length |
| `@MaxLength(n)` | Maximum string length |
| `@Min(n)` | Minimum numeric value |
| `@Max(n)` | Maximum numeric value |
| `@Pattern(regex)` | String must match regex |
| `@NotBlank()` | String must not be empty/whitespace |
| `@Email()` | String must be a valid email |
| `@Size(min, max)` | Collection/string size range |

## Usage

```typescript
import { Introspected } from '@goodie-ts/core';
import { Controller, Post } from '@goodie-ts/http';
import { Validated, MinLength, Email } from '@goodie-ts/validation';

@Introspected()
class CreateUserRequest {
  @MinLength(2)
  accessor name!: string;

  @Email()
  accessor email!: string;
}

@Controller('/api/users')
class UserController {
  @Post('/')
  @Validated()
  async create(body: CreateUserRequest) {
    // body is validated before this runs
  }
}
```

Validation errors return 400 Bad Request with structured error details.

## Custom Constraints

```typescript
import { createConstraint } from '@goodie-ts/validation';

const Uppercase = createConstraint('Uppercase', (value: string) =>
  value === value.toUpperCase() ? undefined : 'Must be uppercase'
);
```

## Setup

No plugin configuration needed — `@goodie-ts/validation` ships pre-scanned components, a transformer plugin, and pre-built Valibot schemas in `components.json`. The transformer auto-discovers them at build time.

## Peer Dependencies

- `@goodie-ts/core` >= 1.0.0
- `@goodie-ts/http` >= 1.0.0
- `valibot` >= 1.0.0

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
