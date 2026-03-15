# @goodie-ts/http

Framework-agnostic HTTP abstractions for goodie-ts. Owns route scanning (scan-phase transformer plugin), typed `Response<T>`, `HttpContext`, and the exception handling pipeline. Adapters (like `@goodie-ts/hono`) bridge these abstractions to specific HTTP frameworks.

## Key Files

| File | Role |
|------|------|
| `src/plugin.ts` | Transformer plugin — scan-phase only. Registers `@Controller` as singleton, populates `metadata.httpController` with `ControllerMetadata` |
| `src/controller.ts` | `@Controller(basePath)` — no-op decorator, metadata extracted by plugin |
| `src/route.ts` | `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch` — no-op route decorators |
| `src/status.ts` | `@Status(code)` — sets default response status, enforced single-use per method |
| `src/response.ts` | `Response<T>` — immutable typed response with static factories (`ok()`, `created()`, `noContent()`, `status()`) and fluent `.header()` |
| `src/http-context.ts` | `HttpContext` — per-request read-only context (headers, query, path params, URL, cookies) |
| `src/exception-handler.ts` | `ExceptionHandler` (abstract) + `handleException()` pipeline + `MappedException` |
| `src/http-server-filter.ts` | `HttpServerFilter` (abstract) + `filterMatchesPath()` ANT-style pattern matching |
| `src/body-validator.ts` | `BodyValidator` (abstract) — hook for adapter plugins to validate parsed body |
| `src/abstract-server-bootstrap.ts` | `AbstractServerBootstrap extends OnStart` — base for adapter-specific server startup |
| `src/generated-routes.ts` | `GeneratedRouteWirer` + `registerGeneratedRoutes()`/`getGeneratedRouteWirer()`/`resetGeneratedRoutes()` — module-level registry for compile-time generated route wiring |

## Transformer Plugin (`src/plugin.ts`)

Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json. Scan-phase only (`visitClass`, `visitMethod`).

- **`visitClass`** — detects `@Controller(basePath)`, registers class as `@Singleton`, initializes `metadata.httpController: ControllerMetadata`
- **`visitMethod`** — detects route decorators (`@Get`, `@Post`, etc.), extracts parameter bindings, return types, and non-route decorator metadata. Stores `RouteMetadata` entries on the controller metadata.

### Implicit Parameter Binding

Implicit binding — no annotations required on parameters:
- **Path variable** — param name matches a route path variable (`:id`)
- **Query param** — primitive types not matching path variables
- **Body param** — non-primitive type on POST/PUT/PATCH methods (at most one per method)
- **`HttpContext` param** — if typed as `HttpContext`
- **`@Status(code)`** — captured as `defaultStatus` on the route, not a parameter binding

## Exception Handling Pipeline

`handleException(error, handlers)` iterates all `ExceptionHandler` components. If a handler returns a `Response<T>`, it throws `MappedException` wrapping that response. Adapters catch `MappedException` and translate to their native response format. If no handler matches, the error is re-thrown.

This lives here (not in the adapter) so all adapters share one pipeline.

## Design Decisions

- **Scan-phase only** — no codegen hook. Route metadata is stored on `metadata.httpController`; adapter plugins (e.g., hono) read it for codegen.
- **No adapter knowledge** — this package knows nothing about Hono, Express, etc.
- **`@Controller` is a singleton** — the plugin registers it as `@Singleton` automatically.
- **`@Status` is single-use** — enforced at build time; error if applied multiple times to same method.
- **Decorator re-exports** — users import from `@goodie-ts/http` directly (not from adapters).
