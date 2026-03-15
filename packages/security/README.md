# @goodie-ts/security

Authentication and authorization for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie).

## Install

```bash
pnpm add @goodie-ts/security
```

## Overview

Provides a two-layer security model: `SecurityFilter` authenticates requests via user-defined `SecurityProvider` implementations, and `@Secured` enforces role-based authorization via AOP.

## Decorators

| Decorator | Description |
|-----------|-------------|
| `@Secured()` | Require any authenticated user (class or method level) |
| `@Secured('admin')` | Require a specific role |
| `@Secured(['admin', 'editor'])` | Require any of the listed roles |
| `@Anonymous()` | Exempt a method from class-level `@Secured` |

## Usage

```typescript
import { Controller, Get } from '@goodie-ts/http';
import { Secured, Anonymous, SecurityProvider, SECURITY_PROVIDER, Principal } from '@goodie-ts/security';
import { Singleton } from '@goodie-ts/core';

// Implement your own authentication
@Singleton({ token: SECURITY_PROVIDER })
class JwtSecurityProvider extends SecurityProvider {
  async authenticate(context: HttpContext): Promise<Principal | undefined> {
    const token = context.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return undefined;
    return verifyToken(token); // { name, roles, attributes }
  }
}

@Controller('/api/admin')
@Secured('admin')
class AdminController {
  @Get('/dashboard')
  async dashboard() {
    return { stats: '...' };
  }

  @Get('/public')
  @Anonymous()
  async publicEndpoint() {
    return { info: 'visible to all' };
  }
}
```

## Security Context

Access the authenticated principal anywhere via `SecurityContext`:

```typescript
import { SecurityContext } from '@goodie-ts/security';

const principal = SecurityContext.current(); // Principal | undefined
```

## Setup

No plugin configuration needed — `@goodie-ts/security` ships pre-scanned components and a transformer plugin in `components.json`. The transformer auto-discovers them at build time.

## Peer Dependencies

- `@goodie-ts/core` >= 1.0.0
- `@goodie-ts/http` >= 1.0.0

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
