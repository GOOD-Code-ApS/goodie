---
"@goodie-ts/openapi": minor
"@goodie-ts/transformer": minor
---

Add OpenAPI 3.0 spec generation from compile-time route metadata. The new `@goodie-ts/openapi` package provides a transformer plugin that reads `@Controller`/`@Get`/`@Post`/etc. metadata and generates an `openapi.json` file alongside the generated code. The transformer's `CodegenContribution` interface now supports an optional `files` field for plugins to emit additional files.
