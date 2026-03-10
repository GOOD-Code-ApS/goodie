# @goodie-ts/hono

Hono adapter for goodie-ts. Re-exports route decorators from `@goodie-ts/http`, provides config-driven CORS, `EmbeddedServer`, `ServerConfig`, and the codegen-only transformer plugin for compile-time route wiring.

## Key Files

| File | Role |
|------|------|
| `src/plugin.ts` | Transformer plugin — reads `metadata.httpController` from http plugin, generates `createRouter()`, `app.onStart()` hook, CORS from config, RPC clients |
| `src/embedded-server.ts` | `EmbeddedServer` — `@Singleton` with multi-runtime support (Node, Bun, Deno; throws for Cloudflare) |
| `src/server-config.ts` | `ServerConfig` — `@ConfigurationProperties('server')` bean with `host`, `port`, `runtime`, `cors` |
| `src/router-helpers.ts` | Runtime helpers (`handleResult`, `corsMiddleware`, `requestScopeMiddleware`) — encapsulate Hono API calls so generated code depends only on stable goodie-ts interfaces |
| `src/index.ts` | Public exports (re-exports `@Controller`, `@Get`/`@Post`/etc from `@goodie-ts/http`) |

## Transformer Plugin (`src/plugin.ts`)

The hono plugin is auto-discovered at build time via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.

The plugin is codegen-only — no `visitClass`/`visitMethod` hooks. It reads route metadata from the http plugin's `metadata.httpController` and generates Hono-specific code.

- **`codegen`** — receives `CodegenContext` with build-time config. Generates per-controller route factories, `createRouter(ctx)`, `app.onStart()` hook (skipped for serverless runtimes like `cloudflare`), RPC types/clients, and CORS middleware from `server.cors.*` config.

### CORS — Config-Driven

CORS is configured via `server.cors.*` properties (like Micronaut's `micronaut.server.cors`):

```json
{
  "server": {
    "cors": {
      "origin": "https://example.com",
      "allowMethods": "GET,POST,PUT",
      "credentials": "true"
    }
  }
}
```

The plugin reads these at build time and generates a global `corsMiddleware()` call in `createRouter()`. No `@Cors` decorator — CORS is a server-level concern, not per-route.

### Runtime Helpers (`src/router-helpers.ts`)

Generated code never calls Hono APIs directly. Instead it calls runtime helpers exported from `@goodie-ts/hono`:

- `handleResult(c, result)` — converts controller return values to Hono Response (Response passthrough, undefined/null → 204, else JSON)
- `corsMiddleware(options?)` — wraps `cors()` from hono/cors
- `requestScopeMiddleware()` — wraps `RequestScopeManager.run()` from @goodie-ts/core

### Route Factory Pattern

```typescript
function __createCtrlRoutes(ctrl: Ctrl) {
  return new Hono()
    .get('/items',
      async (c) => handleResult(c, await ctrl.list(c)))
}
```

## Library Beans (beans.json)

2 singleton beans:
- **ServerConfig** — `@ConfigurationProperties('server')` with host/port/runtime/cors
- **EmbeddedServer** — multi-runtime server, depends on `ServerConfig`

## Design Decisions

- **Adapter pattern** — hono plugin reads from `metadata.httpController` set by the http plugin. Route scanning is in `@goodie-ts/http`, Hono-specific codegen is here.
- **CORS is config-driven** — no `@Cors` decorator. CORS is a server-level concern configured via `server.cors.*` properties, applied globally in `createRouter()`.
- **Security, validation, and OpenAPI removed** — will be rebuilt as dedicated packages
- **Generated code never imports Hono ecosystem directly** — all Hono API calls are in `router-helpers.ts`

## Multi-Runtime Support

`EmbeddedServer` dispatches based on `ServerConfig.runtime`:
- **`node`** (default) — dynamic `import('@hono/node-server')`, requires `@hono/node-server` peer dep
- **`bun`** — `Bun.serve()` via `globalThis.Bun`
- **`deno`** — `Deno.serve()` via `globalThis.Deno`

The plugin reads `server.runtime` from `CodegenContext.config` at build time:
- `'node'` (default) / `'bun'` / `'deno'` → generates `app.onStart()` hook with `EmbeddedServer`
- `'cloudflare'` → serverless: skips the hook and `EmbeddedServer` import (use `createRouter()` directly)
