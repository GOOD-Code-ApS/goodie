---
"@goodie-ts/hono": minor
"@goodie-ts/transformer": minor
"@goodie-ts/vite-plugin": patch
---

feat(hono): extract route codegen into hono plugin, add ServerConfig and configDir support

- Move `createRouter()`/`startServer()` code generation from transformer core into `@goodie-ts/hono` plugin, auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }`
- Add `ServerConfig` class with `@ConfigurationProperties('server')` for host/port configuration
- Rewrite `EmbeddedServer` as a `@Singleton` with `ServerConfig` dependency (no longer synthesized in codegen)
- Resolver now stores controller metadata on `bean.metadata.controller` so plugins can read it
- Remove `hono` peer dependency from `@goodie-ts/transformer` — no longer coupled
- Add `configDir` option to `@goodie-ts/vite-plugin` for JSON config file support
