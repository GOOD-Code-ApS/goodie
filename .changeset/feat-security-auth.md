---
"@goodie-ts/security": minor
"@goodie-ts/transformer": minor
---

feat(security): authentication and authorization via Hono middleware

- @Secured() decorator for requiring authentication on controllers/methods
- @Anonymous() decorator for exempting routes from class-level @Secured
- SecurityProvider<P> abstract class for pluggable auth (JWT, session, API key)
- Principal interface with name + attributes bag
- Compile-time middleware generation in the Hono route chain
- Build-time validation: error when @Secured used without SecurityProvider bean
