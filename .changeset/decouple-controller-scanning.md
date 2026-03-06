---
"@goodie-ts/transformer": minor
"@goodie-ts/hono": minor
---

feat(hono)!: move controller scanning from transformer into hono plugin

BREAKING CHANGE: Removed public exports from `@goodie-ts/transformer`:
`IRControllerDefinition`, `IRRouteDefinition`, `IRRouteValidation`,
`HttpMethod`, `ScannedController`, `ScannedRoute`, `ScannedValidation`.

The transformer core no longer has any HTTP/controller knowledge beyond
`@Controller` implying singleton registration. All route scanning
(`@Get`, `@Post`, `@Validate`, etc.) now lives in the hono plugin's
`visitClass`/`visitMethod` hooks, following the Micronaut pattern where
HTTP processing is fully owned by the framework module.
