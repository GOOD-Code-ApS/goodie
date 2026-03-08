---
'@goodie-ts/transformer': minor
'@goodie-ts/hono': minor
'@goodie-ts/kysely': minor
---

Multi-runtime deployment support

- **@goodie-ts/transformer**: Add `CodegenContext` with build-time config passed to plugin `codegen()` hooks. Config inlining reads `default.json` at build time, removing runtime `node:fs` dependency. Note: environment-specific config files (e.g. `production.json`) are not inlined — use environment variables for deploy-time overrides when using inlined config.
- **@goodie-ts/hono**: Multi-runtime `EmbeddedServer` (Node, Bun, Deno). `ServerConfig` gains `runtime` field (`ServerRuntime` type: `'node' | 'bun' | 'deno'`). **Breaking:** `EmbeddedServer.listen()` is now `async` — callers must `await` it.
- **@goodie-ts/kysely**: Edge dialect support (neon, planetscale, libsql) via optional peer dependencies with `importOptional()` helper.
