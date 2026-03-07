---
'@goodie-ts/security': minor
'@goodie-ts/http': minor
'@goodie-ts/hono': minor
---

Add `@goodie-ts/security` package for declarative authentication and authorization. Introduces `@Secured()`, `@Anonymous()`, `SecurityProvider`, and `SecurityHttpFilter`.

Enriches `HttpFilter` with `HttpFilterContext` (routeMetadata + methodName) enabling filters to make per-route decisions from decorator metadata. The hono plugin populates `HttpFilterContext` from `Symbol.metadata` per-route — no coupling between hono and security packages.
