---
'@goodie-ts/core': minor
'@goodie-ts/transformer': minor
'@goodie-ts/hono': minor
'@goodie-ts/kysely': minor
'@goodie-ts/cli': patch
---

Multi-runtime deployment support

- **@goodie-ts/core**: Add `@RequestScoped` decorator and `RequestScopeManager` for per-request bean instances via `AsyncLocalStorage`. `ApplicationContext` supports `scope: 'request'` with automatic proxy generation for singleton→request-scoped dependencies. Conditional bean evaluation (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissingBean`) now happens at runtime in `ApplicationContext.create()` instead of at build time in the graph builder.
- **@goodie-ts/transformer**: Add `@RequestScoped` to scanner, `@ConditionalOnProperty` `havingValue` support (single string or array matching), `CodegenContext` with build-time config passed to plugin `codegen()` hooks. Config inlining reads `default.json` at build time, removing runtime `node:fs` dependency. Config plugin now recognises `@RequestScoped` as a bean decorator.
- **@goodie-ts/hono**: Multi-runtime `EmbeddedServer` (Node, Bun, Deno). `ServerConfig` gains `runtime` field (`ServerRuntime` type: `'node' | 'bun' | 'deno'`). When `server.runtime` is `'cloudflare'`, `startServer()` and `EmbeddedServer` import are omitted from codegen — use `createRouter(ctx)` directly. Request scope middleware auto-generated when request-scoped beans are present. **Breaking:** `EmbeddedServer.listen()` is now `async` — callers must `await` it.
- **@goodie-ts/kysely**: **Breaking:** `KyselyDatabase` is now abstract with per-dialect implementations (`PostgresKyselyDatabase`, `MysqlKyselyDatabase`, `SqliteKyselyDatabase`, `NeonKyselyDatabase`, `PlanetscaleKyselyDatabase`, `LibsqlKyselyDatabase`, `D1KyselyDatabase`). Each dialect is conditionally activated via `@ConditionalOnProperty('datasource.dialect')`. Per-dialect `DatasourceConfig` classes replace the shared `DatasourceConfig`. `PoolConfig` is conditional on pooled dialects (postgres, mysql). `supportsReturning` moved from standalone function to abstract property on `KyselyDatabase`. `TransactionManager` reads `supportsReturning` from `KyselyProvider` instead of `Dialect` type. D1 dialect is `@RequestScoped` for Cloudflare Workers. Removed: `DatasourceConfig`, `ConnectionStringKyselyDatabase`, `supportsReturning()`, `CONNECTION_STRING_DIALECTS`, `validateDialect()`, `dialect-factory.ts`.
- **@goodie-ts/cli**: Warn when `goodie generate --mode library` produces beans but `package.json` is missing the `"goodie": { "beans": "..." }` field. Silent when the field already exists or no beans were produced.
