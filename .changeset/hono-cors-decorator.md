---
'@goodie-ts/hono': minor
---

Add `@Cors()` decorator for compile-time CORS middleware generation. Can be applied at class level (all routes) or method level (specific routes). Method-level `@Cors` overrides class-level. The hono plugin emits Hono's `cors()` middleware from `hono/cors` in the generated code.
