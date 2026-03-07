---
'@goodie-ts/core': minor
'@goodie-ts/transformer': minor
'@goodie-ts/hono': minor
'@goodie-ts/kysely': minor
---

Multi-runtime deployment support

- **@goodie-ts/core**: Add `RuntimeBindings` — AsyncLocalStorage-based per-request store for platform bindings (e.g. Cloudflare Workers `env`)
- **@goodie-ts/transformer**: Add `CodegenContext` with build-time config passed to plugin `codegen()` hooks. Config inlining reads both `default.json` and `{NODE_ENV}.json` at build time, removing runtime `node:fs` dependency
- **@goodie-ts/hono**: Multi-runtime `EmbeddedServer` (Node, Bun, Deno). Cloudflare Workers `export default` entry point with `RuntimeBindings` middleware. `ServerConfig` gains `runtime` field (`ServerRuntime` type). **Breaking:** `EmbeddedServer.listen()` is now `async` — callers must `await` it
- **@goodie-ts/kysely**: Edge dialect support (neon, planetscale, d1, libsql). D1 uses `RuntimeBindings` for per-request bindings with `getD1Instance()` — each request gets a fresh Kysely instance bound to the current D1 binding
