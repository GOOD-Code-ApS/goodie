# @goodie-ts/cache

In-memory caching for goodie-ts via `@Cacheable`, `@CacheEvict`, and `@CachePut` decorators. Built on `@goodie-ts/aop` interceptor chain.

## Key Files

| File | Role |
|------|------|
| `src/cache-interceptor.ts` | `CacheInterceptor` — AOP interceptor handling get/put/evict with stampede protection |
| `src/cache-manager.ts` | `CacheManager` — in-memory cache store with named caches and TTL |
| `src/cache-transformer-plugin.ts` | `createCachePlugin()` — scans decorators, synthesizes `CacheInterceptor` + `CacheManager` beans |
| `src/decorators/cacheable.ts` | `@Cacheable(cacheName, { ttlMs? })` — cache-aside (get or compute) |
| `src/decorators/cache-evict.ts` | `@CacheEvict(cacheName, { allEntries? })` — evict after method execution |
| `src/decorators/cache-put.ts` | `@CachePut(cacheName, { ttlMs? })` — always execute, then cache result |

## How It Works

1. **Compile time:** `createCachePlugin()` scans `@Cacheable`/`@CacheEvict`/`@CachePut` decorators via `visitMethod`. Populates AOP metadata with `cacheName`, `cacheAction`, `ttlMs`, `allEntries`. Synthesizes `CacheInterceptor` and `CacheManager` singleton beans in `afterResolve`.
2. **Runtime:** `CacheInterceptor` reads `ctx.metadata` to determine the action. Cache keys are `className#methodName:arg1,arg2,...`.

## Cache Key Strategy

Keys include the class name to avoid collisions across classes: `ClassName#methodName:serializedArgs`. Arguments are JSON-serialized; non-serializable args throw an error.

## Stampede Protection

`CacheInterceptor` uses an in-flight promise map. Concurrent calls for the same cache key share a single promise instead of hitting the backend multiple times.

## Plugin Bean Synthesis

The plugin adds two synthetic beans when any cache decorator is found:
- `CacheManager` (singleton) — the cache store
- `CacheInterceptor` (singleton, depends on `CacheManager`) — the AOP interceptor

A `beforeScan` hook clears accumulated state for watch-mode compatibility.

## Gotchas

- Cache is in-memory only — no distributed cache support yet
- TTL is per-entry, checked lazily on read
- `@CacheEvict({ allEntries: true })` clears the entire named cache
- The plugin deduplicates synthetic beans across multiple transform runs
