---
"@goodie-ts/aop": minor
"@goodie-ts/transformer": minor
"@goodie-ts/cli": minor
"@goodie-ts/logging": minor
"@goodie-ts/cache": minor
"@goodie-ts/resilience": minor
"@goodie-ts/health": minor
"@goodie-ts/config": minor
"@goodie-ts/vite-plugin": patch
"@goodie-ts/decorators": patch
---

Add `createAopDecorator()` API for defining AOP decorators with compile-time config via TypeScript type parameters. Migrate logging, cache, and resilience decorators from hand-written `goodie.aop` JSON to source-level `createAopDecorator<{...}>()` calls. Remove redundant transformer plugins from logging, cache, resilience, and health packages — beans are now shipped via `beans.json` manifests and AOP config is extracted automatically by the transformer's AOP scanner.

Auto-discover transformer plugins from installed packages via `goodie.plugin` in `package.json`. The `discoverPlugins()` function now respects `scanScopes`, matching the behavior of library bean discovery. Consumers no longer need to manually list plugins.

**Breaking:** `createHealthPlugin`, `createLoggingPlugin`, `createCachePlugin`, and `createResiliencePlugin` exports have been removed. The `goodie.aop` field in `package.json` is no longer read — AOP config now lives in the `aop` section of `beans.json`.
