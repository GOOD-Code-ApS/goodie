---
"@goodie-ts/core": major
"@goodie-ts/transformer": major
"@goodie-ts/hono": major
"@goodie-ts/cli": major
"@goodie-ts/vite-plugin": major
"@goodie-ts/cache": major
"@goodie-ts/logging": major
"@goodie-ts/resilience": major
"@goodie-ts/kysely": major
"@goodie-ts/testing": major
"@goodie-ts/health": major
"@goodie-ts/events": major
"@goodie-ts/scheduler": major
---

Rename Java-isms to TS-native terminology. `BeanDefinition` → `ComponentDefinition`, `@Bean` → `@Component`, `getBean()` → `get()`, `getAll()` replaces bean collection methods, and similar renames throughout the API surface. This is a breaking change for all packages.
