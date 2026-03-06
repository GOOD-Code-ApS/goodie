---
'@goodie-ts/http': minor
'@goodie-ts/hono': minor
---

Extract framework-agnostic HTTP abstractions into `@goodie-ts/http`. Moves `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`, `@Cors`, `@Validate`, and metadata types out of `@goodie-ts/hono` into a new package. Adds `HttpFilter` interface and `HTTP_FILTER` injection token for generic middleware discovery. `@goodie-ts/hono` re-exports everything for backwards compatibility — no user code changes required.
