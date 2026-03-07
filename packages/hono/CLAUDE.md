# @goodie-ts/hono

Hono HTTP integration for goodie-ts. Provides route decorators, security, the transformer plugin for compile-time route wiring, `@Validate`, `@Cors`, `EmbeddedServer`, and `ServerConfig`.

## Key Files

| File | Role |
|------|------|
| `src/plugin.ts` | Transformer plugin — generates `createRouter()`, `startServer()`, security middleware, RPC clients from controller metadata |
| `src/controller.ts` | `@Controller(basePath?)` — marks class as HTTP controller (compile-time no-op) |
| `src/route.ts` | `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch` — method decorators (compile-time no-ops) |
| `src/secured.ts` | `@Secured()` — marks controller/method as requiring authentication (compile-time no-op) |
| `src/anonymous.ts` | `@Anonymous()` — exempts method from class-level `@Secured` (compile-time no-op) |
| `src/security-provider.ts` | `SecurityProvider` interface + `SECURITY_PROVIDER` injection token |
| `src/security-context.ts` | `SecurityContext` — `@Singleton`, `AsyncLocalStorage`-based principal propagation |
| `src/get-principal.ts` | `getPrincipal(securityContext)` — convenience function |
| `src/principal.ts` | `Principal` type — `{ name, attributes }` |
| `src/errors.ts` | `UnauthorizedError` |
| `src/embedded-server.ts` | `EmbeddedServer` — `@Singleton` wrapping `@hono/node-server` |
| `src/server-config.ts` | `ServerConfig` — `@ConfigurationProperties('server')` bean |
| `src/cors.ts` | `@Cors(options?)` — Hono-specific CORS marker (generates `hono/cors` middleware) |
| `src/validate.ts` | `@Validate` — Hono-specific validation decorator (tied to `@hono/zod-validator`) |
| `src/metadata.ts` | `ValidateMetadata`, `ValidationTarget` types |
| `src/index.ts` | Public exports |

## Transformer Plugin (`src/plugin.ts`)

The hono plugin is auto-discovered at build time via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.

- **`visitClass`** — detects `@Controller(basePath)`, `@Secured`, `@Cors`, registers bean as singleton
- **`visitMethod`** — detects `@Get`/`@Post`/etc, `@Validate`, `@Cors`, `@Secured`, `@Anonymous`
- **`codegen`** — generates per-controller route factories, `createRouter(ctx)`, `startServer()`, RPC types/clients

### Security Middleware Generation

When `@Secured` is used on any controller, the plugin generates Hono-native security middleware directly in the route factory — no `HttpFilter` abstraction. The generated middleware:

1. Resolves `SecurityContext` and `SecurityProvider` from the DI context
2. For secured routes: authenticates via `SecurityProvider`, returns 401 if no principal, wraps in `SecurityContext.run()`
3. For `@Anonymous` routes in a `@Secured` controller: authenticates if possible, sets context, but never rejects

`SecurityProvider` is optional — if not registered, secured routes return 401.

### Route Factory Pattern

```typescript
function __createCtrlRoutes(ctrl: Ctrl, __securityContext: SecurityContext, __securityProvider: SecurityProvider | undefined) {
  return new Hono()
    .get('/secured',
      async (c, next) => { /* security middleware */ },
      async (c) => { return ctrl.method(c) }
    )
    .get('/public',
      async (c) => { return ctrl.publicMethod(c) }
    )
}
```

## Library Beans (beans.json)

3 singleton beans:
- **ServerConfig** — `@ConfigurationProperties('server')` with host/port
- **EmbeddedServer** — wraps `@hono/node-server`, depends on `ServerConfig`
- **SecurityContext** — `AsyncLocalStorage`-based principal storage

## Design Decisions

- **All decorators are compile-time no-ops** — everything is AST-scanned by the plugin
- **No `HttpFilter` abstraction** — security middleware is generated natively using Hono's API (`c.json()`, `c.req`)
- **`@Secured` is HTTP-only** — no service-layer AOP interceptor. The framework is Hono-first.
- **`SecurityProvider` is user-provided** — registered with `SECURITY_PROVIDER` injection token. Optional — if missing, secured routes return 401.
- **`SecurityContext` propagates principal** — via `AsyncLocalStorage`, accessible to downstream services via `getPrincipal()`

## Gotchas

- `@Anonymous` only makes sense on methods inside a `@Secured` controller
- Route decorators are matched by name only (no import source verification)
- `@Validate` generates `zValidator()` middleware — requires `@hono/zod-validator` and `zod` as peer deps
- `SecurityProvider` must be registered by the user — it's not auto-discovered
