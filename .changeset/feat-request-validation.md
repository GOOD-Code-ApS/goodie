---
"@goodie-ts/hono": minor
"@goodie-ts/transformer": minor
---

feat(hono,transformer): request validation via @Validate

- Add `@Validate({ json?, query?, param? })` decorator for controller methods
- Scanner detects `@Validate`, extracts Zod schema references and import paths via ts-morph
- Codegen emits `zValidator()` middleware from `@hono/zod-validator` before route handlers
- Standard 400 error response with sanitized Zod issues on validation failure
- `@hono/zod-validator` and `zod` added as optional peer dependencies
- Hono example updated with Zod schemas for create/update todo validation
