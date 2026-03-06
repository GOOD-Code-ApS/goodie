# @goodie-ts/http

Framework-agnostic HTTP abstractions for goodie-ts. Provides route decorators, metadata types, and the `HttpFilter` interface for generic middleware discovery. No runtime HTTP framework dependency.

## Key Files

| File | Role |
|------|------|
| `src/controller.ts` | `@Controller(basePath?)` — marks class as HTTP controller |
| `src/route.ts` | `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch` — method decorators via `createRouteDecorator()` |
| `src/cors.ts` | `@Cors(options?)` — compile-time CORS marker decorator |
| `src/validate.ts` | `@Validate({ json, query, param })` — compile-time validation marker decorator |
| `src/metadata.ts` | `HTTP_META` symbol keys, `ControllerMetadata`, `RouteMetadata` types |
| `src/http-filter.ts` | `HttpFilter` interface + `HTTP_FILTER` injection token |
| `src/index.ts` | Public exports |

## HTTP_META Keys (metadata.ts)

All are Symbols under the `HTTP_META` object:
- `CONTROLLER` — `ControllerMetadata` (`{ basePath }`)
- `ROUTES` — `RouteMetadata[]` (`{ method, path, methodName }`)
- `VALIDATION` — `ValidateMetadata`

## HttpFilter

Generic middleware discovery mechanism. Library packages register `HttpFilter` beans with `baseTokens: [HTTP_FILTER]`. The HTTP runtime plugin (e.g. Hono) discovers them via `ctx.getAll(HTTP_FILTER)`, sorts by `order`, and applies as middleware.

```typescript
interface HttpFilter {
  order: number;
  middleware(): (c: unknown, next: () => Promise<void>) => Promise<Response | undefined>;
}
```

Lower `order` values run first. This enables loose coupling — security, logging, and other packages contribute middleware without the runtime plugin knowing about them.

## Design Decisions

- **Pure abstractions, no runtime** — this package has zero HTTP framework dependencies. Decorators are compile-time markers (no-ops at runtime).
- **`@goodie-ts/hono` re-exports everything** — users only depend on `@goodie-ts/hono`, which pulls in `@goodie-ts/http` transitively. Existing imports continue to work.
- **`HTTP_META` replaces `HONO_META`** — symbols renamed to be framework-agnostic. `HONO_META` is still re-exported from `@goodie-ts/hono` for backwards compat.
- **`HTTP_FILTER` injection token** — uses `InjectionToken<HttpFilter>` for type-safe discovery via `getAll()`.

## Gotchas

- `@Cors` and `@Validate` are compile-time-only (no-op at runtime). Config is extracted via AST scanning in the Hono plugin.
- Variable references in `@Cors` config are not auto-imported in generated code — only literal values work reliably.
- Route decorators are matched by name only (no import source verification), but only scanned on `@Controller` classes.
