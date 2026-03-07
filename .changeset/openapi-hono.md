---
"@goodie-ts/hono": minor
---

feat: OpenAPI support via hono-openapi

Route decorators (`@Get`, `@Post`, etc.) now accept an optional second argument with OpenAPI options (`DescribeRouteOptions`). When any route has OpenAPI options, the plugin generates `describeRoute()` middleware and mounts `openAPIRouteHandler()` on `/openapi.json`.

- `OpenApiConfig` library bean for title/version/description via `@ConfigurationProperties('openapi')`
- Validation switched from `@hono/zod-validator` to `validator()` from `hono-openapi` — schemas automatically feed into the OpenAPI spec
- New dependencies: `hono-openapi`, `@hono/standard-validator`
- Removed dependency: `@hono/zod-validator`
