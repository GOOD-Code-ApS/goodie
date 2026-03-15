# @goodie-ts/openapi

OpenAPI 3.1 spec generation from runtime introspection metadata and controller route metadata. No transformer plugin — relies entirely on the HTTP plugin for route metadata and the core introspection plugin for type shapes.

## Key Files

| File | Role |
|------|------|
| `src/openapi-spec-builder.ts` | `OpenApiSpecBuilder` — `@Singleton`, builds OAS 3.1 spec lazily on first `getSpec()` call. Discovers controllers via `context.getDefinitions()`, reads `metadata.httpController` |
| `src/openapi-config.ts` | `OpenApiConfig` — `@Singleton @Config('openapi')`, reads `openapi.title`, `openapi.version`, `openapi.description` from config |
| `src/openapi-controller.ts` | `OpenApiController` — `@Controller('/openapi')` with `@Get('.json')`, serves the cached spec |
| `src/decorators/schema.ts` | `@Schema(options)` — no-op field decorator for custom OpenAPI metadata (description, example, format, deprecated, default, enum, readOnly, writeOnly) |
| `src/decorators/api-operation.ts` | `@ApiOperation(options)` — no-op method decorator for operation metadata (summary, description, tags, deprecated) |
| `src/decorators/api-response.ts` | `@ApiResponse(status, options)` — no-op method decorator for custom response entries |

## How It Works

1. **Build time**: Decorators are no-ops. `@Schema` is captured by the introspection plugin as `DecoratorMeta`. `@ApiOperation` and `@ApiResponse` are captured by the HTTP plugin as non-route `DecoratorMeta` on methods.
2. **Runtime**: `OpenApiSpecBuilder.getSpec()` iterates all component definitions with `httpController` metadata, builds path items and operation objects. Resolves `@Introspected` types from `MetadataRegistry` as `$ref` schemas.

## Schema Building

- Primitives map to OAS types directly
- `@Introspected` types become `$ref` entries in `#/components/schemas/`
- Arrays → `type: 'array'` with `items`
- Unions → `oneOf`
- Nullable: inline types use `type: ['string', 'null']` (OAS 3.1), `$ref` types use `oneOf: [$ref, { type: 'null' }]`
- Constraint decorators map to schema properties: `@MinLength` → `minLength`, `@Email` → `format: 'email'`, etc.

## Library Components (components.json)

3 singleton components:
- **OpenApiConfig** — `@Config('openapi')` with title/version/description
- **OpenApiSpecBuilder** — builds and caches the spec, depends on `OpenApiConfig`
- **OpenApiController** — `@Controller('/openapi')`, depends on `OpenApiSpecBuilder`

## Design Decisions

- **No transformer plugin** — all metadata comes from existing plugins (HTTP + introspection). Zero additional build-time overhead.
- **Runtime spec building** — spec is built lazily on first request, then cached. This is acceptable because it only happens once.
- **`openapi3-ts` is a peer dependency** — used at runtime for spec building (not build-time only).
- **Decorators rely on generic `DecoratorMeta` capture** — no special plugin needed because the HTTP and introspection plugins capture all decorators generically.
