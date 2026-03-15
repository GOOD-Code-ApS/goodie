# @goodie-ts/security

Authentication and authorization for goodie-ts. Two-layer model: `SecurityFilter` (HTTP filter, sets principal) and `SecurityInterceptor` (AOP, enforces roles).

## Key Files

| File | Role |
|------|------|
| `src/decorators/secured.ts` | `@Secured(roles?)` — AOP decorator via `createAopDecorator`, order -95 (runs before validation at -90) |
| `src/decorators/anonymous.ts` | `@Anonymous()` — no-op method decorator, exempts from class-level `@Secured` |
| `src/security-filter.ts` | `SecurityFilter extends HttpServerFilter` — `@Singleton`, iterates all `SecurityProvider` instances, calls `SecurityContext.run(principal, next)` |
| `src/security-interceptor.ts` | `SecurityInterceptor implements MethodInterceptor` — `@Singleton`, reads `ctx.metadata.roles` and `ctx.metadata.anonymous`, throws `UnauthorizedError` or `ForbiddenError` |
| `src/security-context.ts` | `SecurityContext` — AsyncLocalStorage-backed store. `run(principal, fn)`, `current()`, `isActive()`. Lazy-loads `AsyncLocalStorage` from `node:async_hooks` |
| `src/security-provider.ts` | `SecurityProvider` (abstract) + `SECURITY_PROVIDER` (InjectionToken) — users implement to provide authentication |
| `src/security-exception-handler.ts` | `SecurityExceptionHandler extends ExceptionHandler` — maps `UnauthorizedError` → 401, `ForbiddenError` → 403 |
| `src/errors.ts` | `UnauthorizedError`, `ForbiddenError` |
| `src/principal.ts` | `Principal` interface — `name`, `roles[]`, `attributes` |
| `src/plugin.ts` | Transformer plugin — `visitClass` captures class-level `@Secured` roles, `visitMethod` captures `@Anonymous`, `afterResolve` mutates interceptor metadata to set `anonymous: true` |

## Transformer Plugin (`src/plugin.ts`)

Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.

- **`visitClass`** — captures `@Secured` class-level roles into `metadata.security.classRoles`
- **`visitMethod`** — captures `@Anonymous` methods into `metadata.security.anonymousMethods`
- **`afterResolve`** — mutates `interceptedMethods` metadata: for `@Anonymous` methods, sets `anonymous: true` on the `SecurityInterceptor` entry so the interceptor skips authorization

## How It Works

1. **Request arrives** → `SecurityFilter` (HTTP filter, runs before controller) iterates all `SecurityProvider` components (injected via `SECURITY_PROVIDER` collection token). First provider returning a `Principal` wins. Wraps the rest of the request in `SecurityContext.run(principal, next)`.
2. **Controller method called** → `SecurityInterceptor` (AOP, order -95) reads roles from `ctx.metadata`. If `anonymous: true`, passes through. Otherwise checks `SecurityContext.current()` — if no principal, throws `UnauthorizedError`. If roles required and principal lacks them, throws `ForbiddenError`.
3. **Exception handling** → `SecurityExceptionHandler` catches `UnauthorizedError` → 401, `ForbiddenError` → 403.

## Library Components (components.json)

3 singleton components:
- **SecurityFilter** — `HttpServerFilter`, depends on `SECURITY_PROVIDER` (collection)
- **SecurityInterceptor** — `MethodInterceptor`
- **SecurityExceptionHandler** — `ExceptionHandler`, `baseTokens: [ExceptionHandler]`

## Design Decisions

- **`SecurityProvider` uses `SECURITY_PROVIDER` InjectionToken** — collection injection, not `baseTokens`. Users must register their provider with this token.
- **Order -95** — `@Secured` runs before `@Validated` (-90) in the interceptor chain.
- **`@Anonymous` via `afterResolve`** — the plugin mutates build-time interceptor metadata rather than adding runtime checks. Zero runtime overhead for anonymous methods.
- **AsyncLocalStorage lazy-loaded** — imports `node:async_hooks` lazily. Includes a Cloudflare Workers error message if unavailable.
