---
"@goodie-ts/hono": minor
---

refactor!: consolidate @goodie-ts/http and @goodie-ts/security into @goodie-ts/hono

BREAKING CHANGES:
- `@goodie-ts/http` package removed — import `Controller`, `Get`, `Post`, `Put`, `Delete`, `Patch` from `@goodie-ts/hono`
- `@goodie-ts/security` package removed — import `Secured`, `Anonymous`, `SecurityProvider`, `SecurityContext`, `SECURITY_PROVIDER`, `getPrincipal`, `Principal`, `UnauthorizedError` from `@goodie-ts/hono`
- `HttpFilter` abstraction removed — security middleware is generated natively by the hono plugin using Hono's middleware API
- `SecurityHttpFilter` removed — replaced by generated Hono-native security middleware
- `SecurityInterceptor` removed — `@Secured` is now HTTP-only (no service-layer AOP enforcement)
- `@Secured()` on service methods is no longer supported — use it on controllers only
