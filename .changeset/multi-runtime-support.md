---
'@goodie-ts/core': minor
'@goodie-ts/transformer': minor
'@goodie-ts/hono': minor
'@goodie-ts/kysely': minor
---

Multi-runtime deployment support

- **@goodie-ts/core**: Add `RuntimeBindings` — AsyncLocalStorage-based per-request store for platform bindings (e.g. Cloudflare Workers `env`)
- **@goodie-ts/transformer**: Add `CodegenContext` with build-time config passed to plugin `codegen()` hooks. Config inlining removes runtime `node:fs` dependency for `loadConfigFiles()`
- **@goodie-ts/hono**: Multi-runtime `EmbeddedServer` (Node, Bun, Deno). Cloudflare Workers `export default` entry point with `RuntimeBindings` middleware. `ServerConfig` gains `runtime` field (`ServerRuntime` type)
- **@goodie-ts/kysely**: Edge dialect support (neon, planetscale, d1, libsql). D1 uses `RuntimeBindings` for per-request bindings. `KyselyDatabase` lazy init for D1 dialect
