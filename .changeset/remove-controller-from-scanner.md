---
'@goodie-ts/transformer': minor
'@goodie-ts/hono': minor
---

Remove `@Controller` from scanner's hardcoded decorator names. Plugins can now register classes as beans via `ctx.registerBean({ scope })` in their `visitClass` hook. The hono plugin uses this to register `@Controller` classes as singletons — the DI core no longer has any HTTP knowledge.

**BREAKING:** `@Controller` is no longer recognized by the scanner without the hono plugin. Projects using `@Controller` must have `@goodie-ts/hono` installed (which was already required for route codegen).
