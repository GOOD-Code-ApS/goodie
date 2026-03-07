---
'@goodie-ts/core': minor
'@goodie-ts/kysely': minor
'@goodie-ts/testing': minor
---

Remove all runtime `Symbol.metadata` usage from decorators. All core decorators (`@Singleton`, `@Injectable`, `@Named`, `@Eager`, `@Module`, `@Provides`, `@Inject`, `@Optional`, `@PostConstruct`, `@PreDestroy`, `@PostProcessor`, `@Value`) are now compile-time no-ops. The `Symbol.metadata` polyfill is removed.

**Breaking:** `META`, `setMeta`, `pushMeta`, `getClassMetadata` exports removed from `@goodie-ts/core`.

`@Migration` now stores the migration name as a static property (`__migrationName`) instead of `Symbol.metadata`. `getMigrationName()` reads from the static property.

`@MockDefinition` now stores its target as a static property (`__mockTarget`) instead of `Symbol.metadata`.
