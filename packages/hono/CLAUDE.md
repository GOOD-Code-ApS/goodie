# @goodie-ts/hono

Hono HTTP integration for goodie-ts. Provides route decorators, security, OpenAPI support via `hono-openapi`, the transformer plugin for compile-time route wiring, `@Validate`, `@Cors`, `EmbeddedServer`, `ServerConfig`, and `OpenApiConfig`.

## Key Files

| File | Role |
|------|------|
| `src/plugin.ts` | Transformer plugin — generates `createRouter()`, `startServer()`, security middleware, OpenAPI middleware, RPC clients from controller metadata |
| `src/controller.ts` | `@Controller(basePath?)` — marks class as HTTP controller (compile-time no-op) |
| `src/route.ts` | `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch` — method decorators with optional OpenAPI options (compile-time no-ops) |
| `src/openapi-types.ts` | `DescribeRouteOptions` — typed OpenAPI options for route decorators |
| `src/openapi-config.ts` | `OpenApiConfig` — `@ConfigurationProperties('openapi')` bean (title, version, description) |
| `src/secured.ts` | `@Secured()` — marks controller/method as requiring authentication (compile-time no-op) |
| `src/anonymous.ts` | `@Anonymous()` — exempts method from class-level `@Secured` (compile-time no-op) |
| `src/security-provider.ts` | `SecurityProvider` interface + `SECURITY_PROVIDER` injection token |
| `src/goodie-env.ts` | `GoodieEnv` — Hono env type for typed `c.get('principal')` access |
| `src/principal.ts` | `Principal` type — `{ name, attributes }` |
| `src/errors.ts` | `UnauthorizedError` |
| `src/embedded-server.ts` | `EmbeddedServer` — `@Singleton` with multi-runtime support (Node, Bun, Deno; throws for Cloudflare) |
| `src/server-config.ts` | `ServerConfig` — `@ConfigurationProperties('server')` bean with `host`, `port`, `runtime` |
| `src/cors.ts` | `@Cors(options?)` — Hono-specific CORS marker (generates `hono/cors` middleware) |
| `src/validate.ts` | `@Validate` — Hono-specific validation decorator |
| `src/metadata.ts` | `ValidateMetadata`, `ValidationTarget` types |
| `src/index.ts` | Public exports |

## Transformer Plugin (`src/plugin.ts`)

The hono plugin is auto-discovered at build time via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.

- **`visitClass`** — detects `@Controller(basePath)`, `@Secured`, `@Cors`, registers bean as singleton
- **`visitMethod`** — detects `@Get`/`@Post`/etc (with optional OpenAPI options as second arg), `@Validate`, `@Cors`, `@Secured`, `@Anonymous`
- **`codegen`** — receives `CodegenContext` with build-time config. Generates per-controller route factories, `createRouter(ctx)`, `startServer()` (skipped for serverless runtimes like `cloudflare`), RPC types/clients, and OpenAPI middleware when routes have OpenAPI options

### OpenAPI Support

Route decorators accept an optional second argument with OpenAPI options:

```typescript
@Get('/', {
  summary: 'List all items',
  description: 'Returns all items',
  tags: ['items'],
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: resolver(itemSchema) } } }
  }
})
```

When any route has OpenAPI options, the plugin:
1. Generates `describeRoute()` middleware (from `hono-openapi`) per annotated route
2. Mounts `openAPIRouteHandler(router, { documentation })` on `/openapi.json`
3. Resolves `OpenApiConfig` from the DI context for the documentation info

Validation always uses `validator()` from `hono-openapi` (replaces `@hono/zod-validator`).

### Security Middleware Generation

When `@Secured` is used on any controller, the plugin generates Hono-native security middleware directly in the route factory — no `HttpFilter` abstraction. The generated middleware:

1. Resolves `SecurityProvider` from the DI context
2. For secured routes: authenticates via `SecurityProvider`, returns 401 if no principal, sets principal on Hono context via `c.set('principal', ...)`
3. For `@Anonymous` routes in a `@Secured` controller: authenticates if possible, sets principal on context, but never rejects

`SecurityProvider` is optional — if not registered, secured routes return 401.

### Route Factory Pattern

```typescript
function __createCtrlRoutes(ctrl: Ctrl, __securityProvider: SecurityProvider | undefined) {
  return new Hono()
    .get('/items',
      describeRoute({ summary: 'List items', responses: { ... } }),
      async (c, next) => { /* security middleware */ },
      async (c) => { return ctrl.list(c) }
    )
}
```

## Library Beans (beans.json)

3 singleton beans:
- **ServerConfig** — `@ConfigurationProperties('server')` with host/port/runtime (`ServerRuntime`: `'node' | 'bun' | 'deno'`)
- **EmbeddedServer** — multi-runtime server, depends on `ServerConfig`. Dispatches to `@hono/node-server` (Node), `Bun.serve()` (Bun), `Deno.serve()` (Deno). Not used for serverless runtimes (`cloudflare`).
- **OpenApiConfig** — `@ConfigurationProperties('openapi')` with title/version/description

## Design Decisions

- **All decorators are compile-time no-ops** — everything is AST-scanned by the plugin
- **No `HttpFilter` abstraction** — security middleware is generated natively using Hono's API (`c.json()`, `c.req`)
- **`@Secured` is HTTP-only** — no service-layer AOP interceptor. The framework is Hono-first.
- **`SecurityProvider` is user-provided** — registered with `SECURITY_PROVIDER` injection token. Optional — if missing, secured routes return 401.
- **Principal via Hono context** — `c.set('principal', ...)` / `c.get('principal')` using `GoodieEnv` type for type safety. No `AsyncLocalStorage` — works on edge runtimes.
- **OpenAPI via `hono-openapi`** — middleware-based approach. `describeRoute()` per route, `openAPIRouteHandler()` for spec. Only generated when routes have OpenAPI options.
- **Validation via `hono-openapi`** — `validator()` replaces `@hono/zod-validator`. Always used (even without OpenAPI options) so validation schemas automatically feed into the spec when OpenAPI is enabled.

## Multi-Runtime Support

`EmbeddedServer` dispatches based on `ServerConfig.runtime`:
- **`node`** (default) — dynamic `import('@hono/node-server')`, requires `@hono/node-server` peer dep
- **`bun`** — `Bun.serve()` via `globalThis.Bun`
- **`deno`** — `Deno.serve()` via `globalThis.Deno`

The plugin reads `server.runtime` from `CodegenContext.config` at build time:
- `'node'` (default) / `'bun'` / `'deno'` → generates `startServer()` with `EmbeddedServer`
- `'cloudflare'` → serverless: skips `startServer()` and `EmbeddedServer` import (use `createRouter()` directly)

## Gotchas

- `@Anonymous` only makes sense on methods inside a `@Secured` controller
- Route decorators are matched by name only (no import source verification)
- `@Validate` generates `validator()` middleware from `hono-openapi` — requires `zod` as peer dep
- `SecurityProvider` must be registered by the user — it's not auto-discovered
- OpenAPI spec is only served when at least one route has the second argument with OpenAPI options
