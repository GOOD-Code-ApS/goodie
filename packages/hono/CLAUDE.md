# @goodie-ts/hono

Hono adapter for goodie-ts. Provides config-driven CORS, `EmbeddedServer`, `ServerConfig`, and the codegen-only transformer plugin for compile-time route wiring. Decorators (`@Controller`, `@Get`, etc.) live in `@goodie-ts/http`.

## Key Files

| File | Role |
|------|------|
| `src/plugin.ts` | Transformer plugin — reads `metadata.httpController` from http plugin, generates `createRouter()`, `app.onStart()` hook, CORS from config, RPC clients |
| `src/embedded-server.ts` | `EmbeddedServer` — `@Singleton` with multi-runtime support (Node, Bun, Deno; throws for Cloudflare) |
| `src/server-config.ts` | `ServerConfig` — `@ConfigurationProperties('server')` bean with `host`, `port`, `runtime`, `cors` |
| `src/router-helpers.ts` | Runtime helpers (`handleResult`, `buildRequest`, `corsMiddleware`, `requestScopeMiddleware`) — encapsulate Hono API calls so generated code depends only on stable goodie-ts interfaces |
| `src/index.ts` | Public exports — adapter-specific beans and helpers only (no decorator re-exports) |

## Transformer Plugin (`src/plugin.ts`)

The hono plugin is auto-discovered at build time via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.

The plugin is codegen-only — no `visitClass`/`visitMethod` hooks. It reads route metadata from the http plugin's `metadata.httpController` and generates Hono-specific code.

- **`codegen`** — receives `CodegenContext` with build-time config. Generates per-controller route factories, `createRouter(ctx)`, `app.onStart()` hook (skipped for serverless runtimes like `cloudflare`), RPC types/clients, and CORS middleware from `server.cors.*` config.

### Request/Response Adaptation

Controller methods use `Request<T>` and `Response<T>` from `@goodie-ts/http`. The hono plugin generates adapter code:

- **No params** → `handleResult(c, await ctrl.method())` — calls method with no args
- **`Request<T>` param** → `handleResult(c, await ctrl.method(await buildRequest(c, parseBody)))` — constructs `Request<T>` from Hono Context. `parseBody` is `true` for POST/PUT/PATCH, `false` otherwise.

`handleResult` uses generic overloads to preserve `TypedResponse<T>` for Hono's RPC type inference — the `hc` client gets full output types.

### CORS — Config-Driven (opt-in)

CORS middleware is only emitted when `server.cors.*` config keys exist:

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

No config → no CORS middleware emitted. No `@Cors` decorator — CORS is a server-level concern.

### Runtime Helpers (`src/router-helpers.ts`)

Generated code never calls Hono APIs directly. Instead it calls runtime helpers exported from `@goodie-ts/hono`:

- `handleResult(c, result)` — converts controller return values to Hono Response. Generic overloads preserve `TypedResponse<T>` for RPC inference.
- `buildRequest(c, parseBody)` — constructs `Request<T>` from Hono Context
- `corsMiddleware(options?)` — wraps `cors()` from hono/cors
- `requestScopeMiddleware()` — wraps `RequestScopeManager.run()` from @goodie-ts/core

### Route Factory Pattern

```typescript
function __createCtrlRoutes(ctrl: Ctrl) {
  return new Hono()
    .get('/items',
      async (c) => handleResult(c, await ctrl.list()))
    .post('/items',
      async (c) => handleResult(c, await ctrl.create(await buildRequest(c, true))))
}
```

## Library Beans (beans.json)

2 singleton beans:
- **ServerConfig** — `@ConfigurationProperties('server')` with host/port/runtime/cors
- **EmbeddedServer** — multi-runtime server, depends on `ServerConfig`

## Design Decisions

- **Adapter pattern** — hono plugin reads from `metadata.httpController` set by the http plugin. Route scanning is in `@goodie-ts/http`, Hono-specific codegen is here.
- **No decorator re-exports** — users import decorators from `@goodie-ts/http` directly. Swapping adapters requires no decorator import changes.
- **CORS is config-driven and opt-in** — only emitted when `server.cors.*` config keys exist.
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
