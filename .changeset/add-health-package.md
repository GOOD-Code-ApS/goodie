---
"@goodie-ts/health": minor
"@goodie-ts/core": minor
"@goodie-ts/transformer": minor
"@goodie-ts/aop": minor
"@goodie-ts/vite-plugin": minor
"@goodie-ts/cli": minor
"@goodie-ts/logging": minor
"@goodie-ts/decorators": minor
"@goodie-ts/hono": minor
"@goodie-ts/kysely": minor
"@goodie-ts/testing": minor
"@goodie-ts/cache": minor
"@goodie-ts/resilience": minor
"@goodie-ts/config": minor
---

Release all packages at v0.5.0. Adds `@goodie-ts/health` package with `HealthIndicator`, `HealthAggregator`, and `UptimeHealthIndicator`. Introduces collection injection via `baseTokens` in core, `beforeScan` plugin hook for watch-mode compatibility, and a generic `buildInterceptorChain<F>` signature that preserves method types.
