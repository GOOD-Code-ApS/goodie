---
'@goodie-ts/hono': minor
---

Generate RPC-compatible typed routes via method chaining. The hono plugin now chains route registrations (`new Hono().get(...).post(...)`) instead of separate statements, enabling TypeScript to infer the full route type. Exports `AppType` and `createClient(baseUrl)` for end-to-end type-safe client usage with Hono's `hc`.
