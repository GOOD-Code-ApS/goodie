# @goodie-ts/security

Declarative authentication and authorization for goodie-ts. Provides `@Secured()`, `@Anonymous()`, `SecurityProvider`, `SecurityHttpFilter` (middleware), and `SecurityInterceptor` (AOP).

## Key Files

| File | Role |
|------|------|
| `src/secured.ts` | `@Secured()` — compile-time no-op marker for auth-required classes/methods |
| `src/anonymous.ts` | `@Anonymous()` — compile-time no-op, exempts a method from class-level `@Secured` |
| `src/security-provider.ts` | `SecurityProvider` interface + `SECURITY_PROVIDER` injection token |
| `src/security-http-filter.ts` | `SecurityHttpFilter` — `HttpFilter` middleware (order -1000), reads `DecoratorMetadata` |
| `src/security-interceptor.ts` | `SecurityInterceptor` — AOP interceptor for service-layer `@Secured` methods |
| `src/security-context.ts` | `SecurityContext` — `AsyncLocalStorage`-based principal propagation |
| `src/get-principal.ts` | `getPrincipal()` — convenience function to read from `SecurityContext` |
| `src/principal.ts` | `Principal` type — `{ name: string; attributes: Record<string, unknown> }` |
| `src/errors.ts` | `UnauthorizedError` — thrown by `SecurityInterceptor` when no principal |
| `src/secured-aop-config.ts` | `createAopDecorator` config — scanned at library build time for AOP mapping |

## Architecture

Two enforcement mechanisms, depending on where `@Secured` is used:

### Controllers (HTTP middleware)
`SecurityHttpFilter` extends `HttpFilter` (from `@goodie-ts/http`). The hono plugin generates static `classDecorators`/`methodDecorators` arrays from `IRBeanDefinition`, passed to `HttpFilterContext`. The filter checks for `Secured`/`Anonymous` decorator names — no runtime `Symbol.metadata`.

```
Request → SecurityHttpFilter (order -1000)
  → SecurityProvider.authenticate(request) → Principal | null
  → Check DecoratorMetadata: @Secured on class/method, @Anonymous override
  → 401 if auth required but no principal
  → SecurityContext.run(principal, next) → downstream handlers
```

### Service-layer (AOP interceptor)
`SecurityInterceptor` is wired automatically via `createAopDecorator` → `beans.json` AOP mapping. Checks `SecurityContext` for a principal and throws `UnauthorizedError` if absent.

On `@Controller` classes with `@Secured`, both mechanisms fire. The interceptor reads the principal from `SecurityContext` (already set by the filter) — effectively a no-op in that case.

## SecurityProvider

User-provided authentication implementation. Registered as a bean with the `SECURITY_PROVIDER` injection token. `SecurityHttpFilter` uses `@Optional()` for the injection — if no provider is registered, the filter skips authentication entirely.

## Design Decisions

- **Compile-time decorators** — `@Secured` and `@Anonymous` are no-ops at runtime. Metadata is extracted by the transformer's decorator scanner and generated as static arrays by the hono plugin.
- **Decorator name matching** — `SecurityHttpFilter` matches on `d.name === 'Secured'` (string), not import paths. Import paths from the scanner are unreliable across library/user code boundaries.
- **Optional SecurityProvider** — `@Optional()` accessor injection. No provider = no auth enforcement. Prevents runtime errors when security is imported but not configured.
- **AsyncLocalStorage propagation** — `SecurityContext.run()` wraps the downstream chain, making the principal available to service-layer `@Secured` methods via `getPrincipal()`.

## Testing

- `__tests__/security-http-filter.test.ts` — unit tests for `SecurityHttpFilter` with mock `SecurityProvider`, testing `@Secured`/`@Anonymous` combinations via `DecoratorEntry` arrays
- `__tests__/security.test.ts` — verifies `@Secured`/`@Anonymous` are no-ops at runtime
- Integration testing via `examples/hono/__tests__/todos.integration.test.ts` with a test `SecurityProvider`

## Gotchas

- `SecurityProvider` must be registered by the user with `SECURITY_PROVIDER` token — it's not auto-discovered
- `SecurityHttpFilter` order is -1000 (runs very early) — other filters should use higher order values
- `@Anonymous` only makes sense on methods inside a `@Secured` controller — has no effect otherwise
