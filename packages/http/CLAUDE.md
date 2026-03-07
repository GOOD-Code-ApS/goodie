# @goodie-ts/http

Framework-agnostic HTTP abstractions for goodie-ts. Provides route decorators, metadata types, and the `HttpFilter` interface for generic middleware discovery. No runtime HTTP framework dependency.

## Key Files

| File | Role |
|------|------|
| `src/controller.ts` | `@Controller(basePath?)` — marks class as HTTP controller |
| `src/route.ts` | `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch` — method decorators via `createRouteDecorator()` |
| `src/http-filter.ts` | `HttpFilter` interface + `HTTP_FILTER` injection token |
| `src/index.ts` | Public exports |

## HttpFilter

Generic middleware discovery mechanism. Library packages register `HttpFilter` beans with `baseTokens: [HTTP_FILTER]`. The HTTP runtime plugin (e.g. Hono) discovers them via `ctx.getAll(HTTP_FILTER)`, sorts by `order`, and applies as middleware.

```typescript
interface HttpFilterContext {
  request: unknown;
  methodName: string;
  classDecorators: DecoratorEntry[];   // compile-time class decorators
  methodDecorators: DecoratorEntry[];  // compile-time method decorators
}
```

`DecoratorEntry` (`{ name, importPath }`) is imported from `@goodie-ts/core`. The hono plugin generates static decorator arrays from `IRBeanDefinition.decorators` and `methodDecorators` at build time — no runtime `Symbol.metadata` involved.

Lower `order` values run first. This enables loose coupling — security, logging, and other packages contribute middleware without the runtime plugin knowing about them.

## Design Decisions

- **Pure abstractions, no runtime** — this package has zero HTTP framework dependencies. Decorators are compile-time markers (no-ops at runtime).
- **Users import directly from `@goodie-ts/http`** — generic HTTP decorators live here, Hono-specific things (`@Validate`, `@Cors`, `EmbeddedServer`) live in `@goodie-ts/hono`.
- **All decorators are compile-time no-ops** — `@Controller`, `@Get`/`@Post`/etc., `@Cors` write nothing to `Symbol.metadata`. The hono transformer plugin extracts everything via AST scanning. `HTTP_META` symbols removed.
- **`HTTP_FILTER` injection token** — uses `InjectionToken<HttpFilter>` for type-safe discovery via `getAll()`.

## Gotchas

- Route decorators are matched by name only (no import source verification), but only scanned on `@Controller` classes.
- `@Validate` and `@Cors` live in `@goodie-ts/hono` (not here) — they're tightly coupled to Hono's middleware (`@hono/zod-validator`, `hono/cors`).
