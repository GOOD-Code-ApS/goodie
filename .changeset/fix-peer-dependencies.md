---
"@goodie-ts/decorators": patch
"@goodie-ts/aop": patch
"@goodie-ts/cache": patch
"@goodie-ts/logging": patch
"@goodie-ts/resilience": patch
"@goodie-ts/health": patch
"@goodie-ts/hono": patch
"@goodie-ts/kysely": patch
"@goodie-ts/events": patch
"@goodie-ts/scheduler": patch
"@goodie-ts/testing": patch
---

fix: move @goodie-ts/* runtime dependencies to peerDependencies

Library packages now declare @goodie-ts/* runtime dependencies as peerDependencies
instead of dependencies. This ensures consumers share a single copy of core packages
like @goodie-ts/core, preventing class identity mismatches at runtime.

Build-time tools (cli, vite-plugin, transformer) are unchanged since they don't share
a runtime with the consumer's application.
