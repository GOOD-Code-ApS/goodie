# @goodie-ts/cache

In-memory caching for goodie-ts via `@Cacheable`, `@CacheEvict`, and `@CachePut` decorators. Built on `@goodie-ts/core` interceptor chain.

## Key Files

| File | Role |
|------|------|
| `src/cache-interceptor.ts` | `CacheInterceptor` — AOP interceptor handling get/put/evict with stampede protection |
| `src/cache-manager.ts` | `CacheManager` — in-memory cache store with named caches and TTL |
| `src/decorators/cacheable.ts` | `@Cacheable(cacheName)` — defined via `createAopDecorator<{ interceptor: CacheInterceptor; metadata: { cacheAction: 'get' }; ... }>()` |
| `src/decorators/cache-evict.ts` | `@CacheEvict(cacheName)` — defined via `createAopDecorator<{ metadata: { cacheAction: 'evict' }; ... }>()` |
| `src/decorators/cache-put.ts` | `@CachePut(cacheName)` — defined via `createAopDecorator<{ metadata: { cacheAction: 'put' }; ... }>()` |

## How It Works

1. **Compile time:** Cache decorators are defined via `createAopDecorator()` with AOP config in the type parameter. The transformer's AOP scanner extracts config and includes it in `beans.json`. The declarative AOP plugin parses decorator args at consumer build time using `argMapping` and `metadata`.
2. **Runtime:** `CacheInterceptor` reads `ctx.metadata` to determine the action. Cache keys are `className#methodName:arg1,arg2,...`.

## Cache Key Strategy

Keys include the class name to avoid collisions across classes: `ClassName#methodName:serializedArgs`. Arguments are JSON-serialized; non-serializable args throw an error.

## Stampede Protection

`CacheInterceptor` uses an in-flight promise map. Concurrent calls for the same cache key share a single promise instead of hitting the backend multiple times.

## Library Beans

The package ships two beans in `beans.json`:
- `CacheManager` (singleton) — the cache store
- `CacheInterceptor` (singleton, depends on `CacheManager`) — the AOP interceptor

Consumers auto-discover them at build time via `discoverLibraryBeans()`.

## Gotchas

- Cache is in-memory only — no distributed cache support yet
- TTL is per-entry, checked lazily on read
- `@CacheEvict({ allEntries: true })` clears the entire named cache
- The plugin deduplicates synthetic beans across multiple transform runs
