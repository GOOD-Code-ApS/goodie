---
"@goodie-ts/transformer": minor
---

refactor!: unify @Module into @Singleton — @Provides is now an orthogonal capability on any bean

- Removed `IRModule`, `ScannedModule`, `ScannedModuleImport` types
- `@Module` classes are now scanned as regular beans (singleton scope) with `isModule` metadata
- `@Provides` expansion happens in the resolver stage instead of graph-builder's `expandModules()`
- Removed module imports (`@Module({ imports: [...] })`) — use constructor injection instead
- Any bean can now have `@Provides` methods, not just `@Module` classes
