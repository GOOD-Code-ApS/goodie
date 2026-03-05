---
"@goodie-ts/kysely": minor
---

feat(kysely): multi-dialect CrudRepository support

CrudRepository now auto-detects whether the dialect supports RETURNING via the Kysely adapter. PostgreSQL/SQLite use RETURNING as before; MySQL falls back to INSERT + SELECT for save() and SELECT + DELETE for deleteById(). TransactionManager exposes supportsReturning with optional explicit override to avoid Kysely internals.
