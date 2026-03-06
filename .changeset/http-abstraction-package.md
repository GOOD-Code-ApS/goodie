---
'@goodie-ts/http': minor
'@goodie-ts/hono': minor
---

Extract framework-agnostic HTTP abstractions into `@goodie-ts/http`. Moves `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`, `@Cors`, and metadata types out of `@goodie-ts/hono` into a new package. Adds `HttpFilter` interface and `HTTP_FILTER` injection token for generic middleware discovery. `@goodie-ts/hono` re-exports everything for backwards compatibility — no user code changes required.

**Note:** Metadata symbol identity changed from `Symbol('goodie:hono:controller')` to `Symbol('goodie:http:controller')` (and similarly for routes). `HONO_META` is now an alias for `HTTP_META`. This is technically a breaking change, but the symbols are internal — user code does not read them directly. At `0.x` semver, minor bumps may contain breaking changes.
