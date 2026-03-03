---
"@goodie-ts/health": minor
"@goodie-ts/core": minor
"@goodie-ts/transformer": minor
"@goodie-ts/aop": minor
"@goodie-ts/vite-plugin": minor
"@goodie-ts/cli": minor
"@goodie-ts/logging": patch
---

Add `@goodie-ts/health` package with `HealthIndicator`, `HealthAggregator`, and `UptimeHealthIndicator`. Introduces collection injection via `baseTokens` in core, `beforeScan` plugin hook for watch-mode compatibility, and a generic `buildInterceptorChain<F>` signature that preserves method types.
