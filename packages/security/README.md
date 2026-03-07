# @goodie-ts/security

Declarative authentication and authorization for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie).

## Install

```bash
pnpm add @goodie-ts/security
```

## Overview

Provides `@Secured()` and `@Anonymous()` decorators for declarative auth on controllers and service-layer beans. Authentication logic is pluggable via the `SecurityProvider` interface.

Two enforcement mechanisms:
- **Controllers** — `SecurityHttpFilter` middleware checks compile-time decorator metadata before the route handler runs
- **Service-layer** — `SecurityInterceptor` (AOP) checks the `SecurityContext` for an authenticated principal

## Usage

### 1. Implement a SecurityProvider

```typescript
import { Singleton } from '@goodie-ts/core';
import type { SecurityProvider, SecurityRequest, Principal } from '@goodie-ts/security';
import { SECURITY_PROVIDER } from '@goodie-ts/security';

@Singleton({ token: SECURITY_PROVIDER })
class JwtSecurityProvider implements SecurityProvider {
  async authenticate(request: SecurityRequest): Promise<Principal | null> {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const payload = await verifyJwt(token);
    return { name: payload.sub, attributes: { roles: payload.roles } };
  }
}
```

### 2. Secure controllers

```typescript
import { Controller, Get } from '@goodie-ts/http';
import { Secured, Anonymous } from '@goodie-ts/security';

@Controller('/api/admin')
@Secured()
class AdminController {
  @Get('/users')
  listUsers(c: Context) { ... }  // requires auth

  @Get('/health')
  @Anonymous()
  health(c: Context) { ... }     // public
}
```

### 3. Secure service-layer methods

```typescript
import { Singleton } from '@goodie-ts/core';
import { Secured } from '@goodie-ts/security';

@Singleton()
class OrderService {
  @Secured()
  async placeOrder() { ... }  // throws UnauthorizedError if no principal
}
```

### 4. Access the authenticated principal

```typescript
import { getPrincipal } from '@goodie-ts/security';

const principal = getPrincipal();
console.log(principal?.name);
```

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Secured()` | class / method | Requires authentication |
| `@Anonymous()` | method | Exempts from class-level `@Secured()` |

## Key Types

| Type | Description |
|------|-------------|
| `SecurityProvider` | Interface — implement to provide authentication logic |
| `SecurityRequest` | Minimal request abstraction (headers, url, method) |
| `Principal` | Authenticated user — `{ name: string; attributes: Record<string, unknown> }` |
| `SecurityContext` | AsyncLocalStorage-based principal propagation |
| `UnauthorizedError` | Thrown by `SecurityInterceptor` when no principal |

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
