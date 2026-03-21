# @goodie-ts/hono

Hono adapter for goodie-ts. Thin I/O bridge between `@goodie-ts/http`'s generic HTTP abstractions and Hono's native API. Provides config-driven CORS, `EmbeddedServer`, `ServerConfig`, `HonoServerBootstrap` (library component), and runtime helpers.

## Key Files

| File | Role |
|------|------|
| `src/hono-server-bootstrap.ts` | `HonoServerBootstrap` — `@Singleton` library component extending `AbstractServerBootstrap`, creates Hono router and starts `EmbeddedServer` on `onStart()` |
| `src/embedded-server.ts` | `EmbeddedServer` — `@Singleton` with multi-runtime support (Node, Bun, Deno; throws for Cloudflare) |
| `src/server-config.ts` | `ServerConfig` — `@Config('server')` component with `host`, `port`, `runtime`, `cors` |
| `src/router-helpers.ts` | Runtime helpers (`toHonoResponse`, `toHonoErrorResponse`, `buildHttpContext`, `corsMiddleware`, `requestScopeMiddleware`) — encapsulate Hono API calls so generated code depends only on stable goodie-ts interfaces |
| `src/index.ts` | Public exports — adapter-specific components and helpers only (no decorator re-exports) |

## HonoServerBootstrap

`HonoServerBootstrap` is a library component (in `components.json`) that extends `AbstractServerBootstrap` (from `@goodie-ts/http`) which extends `OnStart` (from `@goodie-ts/core`). It is discovered at runtime via the `baseTokens` mechanism.

- **`@ConditionalOnProperty('server.runtime', { havingValue: ['node', 'bun', 'deno'] })`** — excluded on Cloudflare Workers (serverless deployments call `createHonoRouter(ctx)` directly)
- **`onStart(ctx)`** — calls `createHonoRouter(ctx)` to build the Hono app, then `embeddedServer.listen(router)` to start serving
- **baseTokenRefs chain**: `HonoServerBootstrap → AbstractServerBootstrap → OnStart`

### Parameter Binding & Response Adaptation

Controller methods use implicit parameter binding. The hono plugin generates per-param extraction code:

- **No params** → `toHonoResponse(c, await ctrl.method())` — calls method with no args
- **Path params** → `extractPathParam(c, 'id')` or `extractPathParam(c, 'id', 'number')` for typed coercion
- **Query params** → `extractQueryParam(c, 'name')` for scalars, `extractQueryParams(c, 'name')` for arrays, with optional type coercion
- **Body params** → `await extractBody<DtoType>(c)` (POST/PUT/PATCH only), generic preserves body type
- **`HttpContext` param** → `buildHttpContext(c)` — read-only request context (headers, cookies, etc.)
- **`@Status(code)`** → passes `defaultStatus` to `toHonoResponse` for plain return values

`toHonoResponse` uses generic overloads to preserve `TypedResponse<T>` for Hono's RPC type inference — the `hc` client gets full output types.

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

- `extractPathParam<T>(c, name, type?)` — extract path param with generic type coercion (`'number'`, `'boolean'`, or default `'string'`)
- `extractQueryParam<T>(c, name, type?)` — extract single query param with generic type coercion
- `extractQueryParams<T>(c, name, type?)` — extract all values for a query param (array) with generic type coercion
- `extractBody<T>(c)` — parse JSON body, generic preserves the DTO type
- `toHonoResponse(c, result, defaultStatus?)` — translates controller return values to Hono Response. Optional `defaultStatus` from `@Status` decorator. Generic overloads preserve `TypedResponse<T>` for RPC inference.
- `toHonoErrorResponse(c, result)` — translates `Response<T>` from exception handling to native `Response`. Returns non-generic `Response` to avoid polluting Hono's RPC type inference.
- `buildHttpContext(c)` — constructs `HttpContext` from Hono Context (read-only: headers, cookies, query, params, url)
- `corsMiddleware(options?)` — wraps `cors()` from hono/cors
- `requestScopeMiddleware()` — wraps `RequestScopeManager.run()` from @goodie-ts/core

### Error Handling

All route handlers are wrapped in try/catch. At startup, `createRouter` resolves all `ExceptionHandler` components via `ctx.getAll(ExceptionHandler)`. Caught errors are delegated to `handleException()` from `@goodie-ts/http` which iterates all handlers. If a handler returns a `Response<T>`, it's translated to a Hono response via `toHonoResponse()`. If no handler matches, the error is re-thrown.

Multiple handlers are supported (validation, security, custom) — the generic pipeline lives in `@goodie-ts/http`, the adapter only bridges I/O.

### Route Factory Pattern

```typescript
function __createCtrlRoutes(ctrl: Ctrl, __exceptionHandlers: ExceptionHandler[]) {
  return new Hono()
    .get('/items',
      async (c) => {
        try {
          return toHonoResponse(c, await ctrl.list())
        } catch (e) {
          handleException(e, __exceptionHandlers)
          throw e
        }
      })
}
```

`handleException` throws `MappedException` if a handler matches — caught by `.onError()` on the router chain and translated via `toHonoErrorResponse`. This keeps the catch block throw-only, preserving RPC type inference.

## Library Components (components.json)

3 singleton components:
- **ServerConfig** — `@Config('server')` with host/port/runtime/cors
- **EmbeddedServer** — multi-runtime server, depends on `ServerConfig`
- **HonoServerBootstrap** — extends `AbstractServerBootstrap → OnStart`, conditional on `server.runtime` being `node`/`bun`/`deno`, depends on `EmbeddedServer`

## Design Decisions

- **Thin I/O bridge** — hono adapter only bridges Hono's native API to `@goodie-ts/http` abstractions. Exception handling pipeline, `ExceptionHandler`, and `handleException()` live in `@goodie-ts/http`. A future Express adapter would use the same pipeline with its own I/O bridge.
- **Adapter pattern** — hono plugin reads from `metadata.httpController` set by the http plugin. Route scanning is in `@goodie-ts/http`, Hono-specific codegen is here.
- **No decorator re-exports** — users import decorators from `@goodie-ts/http` directly. Swapping adapters requires no decorator import changes.
- **CORS is config-driven and opt-in** — only emitted when `server.cors.*` config keys exist.
- **Error handling is always-on** — route handlers always have try/catch. Exception handlers are optional runtime components. No conditional codegen for error handling.
- **Generated code never imports Hono ecosystem directly** — all Hono API calls are in `router-helpers.ts`

## Multi-Runtime Support

`EmbeddedServer` dispatches based on `ServerConfig.runtime`:
- **`node`** (default) — dynamic `import('@hono/node-server')`, requires `@hono/node-server` peer dep
- **`bun`** — `Bun.serve()` via `globalThis.Bun`
- **`deno`** — `Deno.serve()` via `globalThis.Deno`

`HonoServerBootstrap` uses `@ConditionalOnProperty('server.runtime', { havingValue: ['node', 'bun', 'deno'] })` — when `server.runtime` is `'cloudflare'`, the component is excluded at runtime, and users call `createHonoRouter(ctx)` directly.

### Async Request-Scoped Pre-Initialization

`createHonoRouter` automatically pre-initializes all request-scoped components via `getAsync()` at the start of each request, before route handlers execute. This ensures components with async `@OnInit` (e.g. `D1KyselyDatabase` with dynamic imports) are fully initialized before scoped proxies resolve them synchronously via `get()`. Without this, scoped proxies would throw `AsyncComponentNotReadyError`.
