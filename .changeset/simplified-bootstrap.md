---
"@goodie-ts/core": minor
"@goodie-ts/transformer": minor
"@goodie-ts/hono": minor
"@goodie-ts/testing": minor
---

Simplify application bootstrap: `await app.start()` is now the single entry point. The hono plugin registers an `onStart` hook to wire the router and start the HTTP server automatically. Remove `startServer()`, `createApp()`, and `export { definitions }` from generated code. Generated route wiring now calls stable `@goodie-ts/hono` runtime helpers (`handleResult`, `securityMiddleware`, `validationMiddleware`, etc.) instead of raw Hono/hono-openapi APIs. `createGoodieTest()` now accepts a definitions factory function and supports custom fixtures derived from the ApplicationContext.
