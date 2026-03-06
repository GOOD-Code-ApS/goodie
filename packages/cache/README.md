# @goodie-ts/cache

In-memory caching for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) via decorators. Built on the AOP interceptor chain in `@goodie-ts/core`.

## Install

```bash
pnpm add @goodie-ts/cache
```

## Overview

Declarative caching using `@Cacheable`, `@CacheEvict`, and `@CachePut` decorators. Cache entries are stored in-memory with optional TTL. Includes stampede protection for concurrent async calls.

## Decorators

| Decorator | Description |
|-----------|-------------|
| `@Cacheable(cacheName, { ttlMs? })` | Return cached value if present, otherwise execute and cache |
| `@CacheEvict(cacheName, { allEntries? })` | Execute method, then evict from cache |
| `@CachePut(cacheName, { ttlMs? })` | Always execute method, then cache the result |

## Usage

```typescript
import { Cacheable, CacheEvict } from '@goodie-ts/cache';
import { Singleton } from '@goodie-ts/core';

@Singleton()
class UserService {
  @Cacheable('users', { ttlMs: 60_000 })
  async findAll() {
    return db.selectFrom('users').selectAll().execute();
  }

  @CacheEvict('users', { allEntries: true })
  async create(name: string) {
    return db.insertInto('users').values({ name }).execute();
  }
}
```

## Setup

No plugin configuration needed — `@goodie-ts/cache` ships pre-scanned beans and AOP config in `beans.json`. The transformer auto-discovers them at build time.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
