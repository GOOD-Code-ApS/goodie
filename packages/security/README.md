# @goodie-ts/security

Authentication and authorization for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) Hono controllers via compile-time middleware generation.

## Install

```bash
pnpm add @goodie-ts/security
```

## Overview

Declarative authentication using `@Secured` and `@Anonymous` decorators on `@Controller` classes and route methods. The transformer detects your `SecurityProvider` implementation at build time and generates inline Hono middleware that calls `authenticate()` on every secured route.

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Secured()` | Class / Method | Require authentication for all routes (class) or a single route (method) |
| `@Anonymous()` | Method | Exempt a route from class-level `@Secured()` |

## Usage

### 1. Implement a SecurityProvider

```typescript
import { Singleton } from '@goodie-ts/decorators';
import { SecurityProvider, Principal } from '@goodie-ts/security';

interface JwtPrincipal extends Principal {
  attributes: { sub: string; scopes: string[] };
}

@Singleton()
export class JwtAuth extends SecurityProvider<JwtPrincipal> {
  async authenticate(request: Request): Promise<JwtPrincipal | null> {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    return verifyJwt(token); // your JWT verification logic
  }
}
```

### 2. Secure controllers and routes

```typescript
import { Controller, Get } from '@goodie-ts/hono';
import { Secured, Anonymous } from '@goodie-ts/security';
import type { Context } from 'hono';

@Secured()
@Controller('/api/users')
export class UserController {
  @Get('/')
  async list(c: Context) {
    const principal = c.get('principal');
    return { user: principal.name };
  }

  @Anonymous()
  @Get('/health')
  health() {
    return { status: 'ok' };
  }
}
```

In the example above, `GET /api/users/` requires authentication (returns 401 if `authenticate()` returns null), while `GET /api/users/health` is publicly accessible.

### Accessing the principal

The authenticated principal is available on the Hono context:

```typescript
const principal = c.get('principal');
console.log(principal.name);       // e.g. "user-123"
console.log(principal.attributes); // e.g. { sub: "user-123", scopes: ["read"] }
```

## Setup

No plugin configuration needed. The transformer detects `extends SecurityProvider` at build time and wires authentication middleware into the generated route chain. If `@Secured` is used without a `SecurityProvider` bean, the build fails with a `MissingProviderError`.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
