# @goodie-ts/cache

In-memory caching for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) via decorators. Built on `@goodie-ts/aop`.

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
import { Singleton } from '@goodie-ts/decorators';

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

## Vite Plugin Setup

```typescript
import { diPlugin } from '@goodie-ts/vite-plugin';
import { createCachePlugin } from '@goodie-ts/cache';

export default defineConfig({
  plugins: [diPlugin({ plugins: [createCachePlugin()] })],
});
```

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
