---
'@goodie-ts/core': major
'@goodie-ts/transformer': major
---

Improve error messages and diagnostics

- **@goodie-ts/core**: `MissingDependencyError` now includes `requiredBy` context and an optional `hint` field. `get()`/`getAsync()`, `validateDependencies()`, and dependency resolution all suggest similar token names via Levenshtein distance ("Did you mean: UserService?"). When a bean was excluded by a conditional rule (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissingBean`), the error explains why ("bean exists but was excluded by: @ConditionalOnProperty('datasource.dialect', 'postgres') — property is 'mysql'"). `@PostConstruct` and `@PreDestroy` errors include bean name and method with `{ cause }` chaining.
- **@goodie-ts/transformer**: `MissingProviderError` now includes fuzzy matching suggestions ("Did you mean: UserService?"). Plugin hook errors are wrapped with plugin name context and preserve the original error via `{ cause }`. `GOODIE_DEBUG=true` prints the full bean graph, resolution order, active plugins, and codegen contributions during build.
