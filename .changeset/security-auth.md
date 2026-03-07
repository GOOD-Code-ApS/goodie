---
'@goodie-ts/security': minor
'@goodie-ts/http': minor
'@goodie-ts/hono': minor
'@goodie-ts/core': minor
'@goodie-ts/transformer': minor
---

Add `@goodie-ts/security` package for declarative authentication and authorization. Introduces `@Secured()`, `@Anonymous()`, `SecurityProvider`, and `SecurityHttpFilter`.

Add compile-time `DecoratorMetadata` infrastructure. The transformer records class and method decorators (with resolved import paths) on `IRBeanDefinition`. `HttpFilterContext` now carries `classDecorators` and `methodDecorators` arrays instead of runtime `Symbol.metadata`. The hono plugin generates static decorator metadata at build time — no runtime `Symbol.metadata` needed for security checks. `@Secured()` and `@Anonymous()` are compile-time markers (no-ops at runtime).

`DecoratorEntry` type exported from `@goodie-ts/core`. `IRDecoratorEntry` and `methodDecorators` added to transformer IR.

**Breaking:** All HTTP decorators (`@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`) are now compile-time no-ops — they no longer write to `Symbol.metadata`. `HTTP_META`, `HONO_META`, `ControllerMetadata`, and `RouteMetadata` exports removed. `HttpFilterContext.routeMetadata` replaced with `classDecorators`/`methodDecorators`. `@goodie-ts/hono` no longer re-exports decorators from `@goodie-ts/http` — import generic HTTP decorators (`@Controller`, `@Get`, `@Post`, etc.) from `@goodie-ts/http` directly. Only Hono-specific exports (`@Validate`, `@Cors`, `EmbeddedServer`, `ServerConfig`) remain in `@goodie-ts/hono`. `@Cors` moved from `@goodie-ts/http` to `@goodie-ts/hono` (tied to `hono/cors` middleware). At `0.x` semver, minor bumps may contain breaking changes.
