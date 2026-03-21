---
"@goodie-ts/cli": minor
"@goodie-ts/hono": patch
"@goodie-ts/kysely": patch
---

Add Cloudflare Workers runtime support.

- **`@goodie-ts/cli`**: Add `--config-dir` flag to `goodie generate` for build-time config inlining without requiring Vite. Enables Cloudflare Workers projects to use the CLI directly with Wrangler.
- **`@goodie-ts/hono`**: Pre-initialize async request-scoped components (e.g. `D1KyselyDatabase`) at the start of each request in `createHonoRouter`. Fixes `AsyncComponentNotReadyError` when scoped proxies resolve synchronously against components with async `@OnInit`.
- **`@goodie-ts/kysely`**: Inline `await import()` calls in `D1KyselyDatabase` with static string specifiers so Cloudflare Workers bundlers (esbuild) can statically resolve `kysely` and `kysely-d1`.
