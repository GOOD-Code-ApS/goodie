# @goodie-ts/security

Authentication decorators for goodie-ts Hono controllers. The transformer detects `extends SecurityProvider` at build time and generates inline Hono middleware for auth checks.

## Key Files

| File | Role |
|------|------|
| `src/principal.ts` | `Principal` interface — `name: string` + `attributes: Record<string, unknown>` |
| `src/security-provider.ts` | `SecurityProvider<P>` — abstract class with `authenticate(request: Request): Promise<P \| null>` |
| `src/secured.ts` | `@Secured()` — Stage 3 class + method decorator, sets `goodie:security:secured` metadata |
| `src/anonymous.ts` | `@Anonymous()` — Stage 3 method decorator, exempts route from class-level `@Secured` |
| `src/metadata.ts` | `SECURITY_META` — Symbol keys for decorator metadata |

## How It Works

1. **Compile time:** The transformer's scanner detects any `@Singleton` (or `@Injectable`) class that `extends SecurityProvider` via `extendsSecurityProvider()` name-based check. It records the class as `securityProvider` in the scan result. The scanner also detects `@Secured` and `@Anonymous` on controller classes and route methods, producing `IRRouteSecurity` metadata on each route.
2. **Graph builder:** `validateSecurityProvider()` throws `MissingProviderError` if any route uses `@Secured` but no `SecurityProvider` bean exists. The `securityProvider` ref is passed through to codegen.
3. **Codegen:** `generateSecurityMiddleware()` produces inline Hono middleware functions. For routes needing auth, the middleware calls `__securityProvider.authenticate(c.req.raw)`, returns 401 if null, or sets `c.set('principal', principal)` and calls `next()`. The `SecurityProvider` bean is added as a dependency of the `EmbeddedServer` bean definition.

## Principal Interface

Minimal identity model: `name` (maps to JWT `sub`, username, API key ID, etc.) plus `attributes` bag (`Record<string, unknown>`) for claims, roles, permissions, or any other auth context. `SecurityProvider<P>` is generic over `P extends Principal`, so consumers can define typed principals.

## SecurityProvider

Abstract class detected by the scanner via `extends SecurityProvider` name match (consistent with all other decorator detection -- name-based, no import verification). Only one provider is allowed; the scanner warns if multiple are found and uses the first. Must be registered as a `@Singleton` bean.

## @Secured and @Anonymous

- `@Secured()` on a class: all routes require auth unless individually exempted with `@Anonymous()`
- `@Secured()` on a method: only that route requires auth
- `@Anonymous()` on a method: exempts the route from class-level `@Secured`; scanner warns if used without class-level `@Secured` since it has no effect

## Middleware Generation

Security middleware is generated as inline arrow functions in the Hono route chain. When both security and validation middleware apply to a route, security runs first (auth check before input validation). The generated code pattern:

```
__honoApp.get('/path', authMiddleware, validationMiddleware, async (c) => { ... })
```

## Design Decisions

- **No AOP** -- security is not an AOP decorator. It generates Hono middleware directly in the route chain rather than using the interceptor pattern. This is intentional: auth happens at the HTTP layer before the controller method is called, not as a method-level aspect.
- **No `@Roles`** -- initially included then dropped. Role/permission checks belong in application logic using `c.get('principal').attributes`, not framework-level decorators. This keeps the framework surface minimal.
- **No runtime scanning** -- `SecurityProvider` detection is compile-time only. The scanner looks for `extends SecurityProvider` in the AST; there is no marker interface or collection injection at runtime.
- **Build-time validation** -- if `@Secured` is used but no `SecurityProvider` bean exists, the graph builder throws `MissingProviderError` at build time, not at runtime.

## Gotchas

- `SecurityProvider` detection is name-based (like all decorator detection in the scanner). Renaming the base class or using a re-export with a different name will not be detected.
- Only one `SecurityProvider` implementation is supported. Multiple implementations trigger a warning and only the first is used.
- `@Anonymous()` is method-only. It has no effect at the class level.
- The `principal` is set on the Hono context via `c.set('principal', principal)` and accessed via `c.get('principal')` in controller methods.
