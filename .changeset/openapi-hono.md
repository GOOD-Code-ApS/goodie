---
"@goodie-ts/openapi-hono": minor
---

feat: OpenAPI spec generation via @hono/zod-openapi

New `@goodie-ts/openapi-hono` package that generates `@hono/zod-openapi` compatible route definitions from compile-time controller metadata.

- Generates `createRoute()` definitions with request schemas from `@Validate`, security from `@Secured`, and auto-inferred responses
- Generates `createOpenApiRouter(ctx)` using `OpenAPIHono` with `.openapi()` route registration
- Serves OpenAPI 3.1 spec at `/openapi.json` via `app.doc()` — no `node:fs`, edge-compatible
- `@ApiResponse(status, description)` — explicit response definitions
- `@ApiOperation({ summary, description, tags, deprecated })` — route-level metadata
- `@ApiTag(name)` — override controller-level tag
- `OpenApiConfig` library bean for title/version/description via `@ConfigurationProperties('openapi')`
- Auto-infers: 201 for POST, 400 on `@Validate`, 401 on `@Secured`, 404 on path params
