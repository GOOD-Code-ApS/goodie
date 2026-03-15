# @goodie-ts/management

Management endpoints for runtime introspection of goodie-ts applications. Three HTTP controllers under `/management`.

## Key Files

| File | Role |
|------|------|
| `src/components-endpoint.ts` | `ComponentsEndpoint` — `GET /management/components`. Lists all non-internal component definitions with token name, scope, eager flag, dependencies, and conditional rules. Filters out `ApplicationContext` and `__Goodie_Config` |
| `src/env-endpoint.ts` | `EnvEndpoint` — `GET /management/env`. Resolves config via `__Goodie_Config` definition's factory, masks sensitive keys |
| `src/info-endpoint.ts` | `InfoEndpoint` — `GET /management/info`. Reads `info.*` config properties, restructures into nested object via dotted-path expansion |

## How It Works

- **ComponentsEndpoint** — injects `ApplicationContext`, calls `getDefinitions()`, maps each to a JSON-safe shape (token name, scope, eager, deps with optional/collection flags, conditional rules). Excludes internal framework components.
- **EnvEndpoint** — looks up `__Goodie_Config` by `InjectionToken.description` among all definitions, calls its `factory()` to get the flat config map. Masks values for keys containing sensitive segments (`password`, `credential`, `certificate`, `key`, `secret`, `token`) delimited by `.`, `_`, or `-`.
- **InfoEndpoint** — same config lookup, filters to `info.*` keys, strips the `info.` prefix, and expands dotted paths into nested objects via `setNestedValue()`.

## Library Components (components.json)

3 singleton components:
- **ComponentsEndpoint** — `@Controller('/management')`, depends on `ApplicationContext`
- **EnvEndpoint** — `@Controller('/management')`, depends on `ApplicationContext`
- **InfoEndpoint** — `@Controller('/management')`, depends on `ApplicationContext`

## Design Decisions

- **No transformer plugin** — pure runtime introspection via `ApplicationContext`.
- **Config access via `__Goodie_Config` factory** — bypasses normal DI to access the raw flat config map. This is an internal framework detail.
- **No security applied by default** — users should apply `@Secured` or route-level filtering to restrict access to management endpoints.
- **Sensitive key masking is segment-level** — `api_key` matches but `monkey` does not, because `key` must be a complete segment bounded by `.`, `_`, or `-`.
