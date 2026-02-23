# @goodie/decorators

User-facing decorators that attach metadata via `Symbol.metadata`. These are read at compile time by the transformer — they do NOT wire anything at runtime.

## Key Files

| File | Role |
|------|------|
| `src/metadata.ts` | `META` symbol keys, `setMeta()`, `pushMeta()`, `getClassMetadata()`, Symbol.metadata polyfill |
| `src/injectable.ts` | `@Injectable()` — prototype scope |
| `src/singleton.ts` | `@Singleton()` — singleton scope |
| `src/named.ts` | `@Named(name)` — qualifier for disambiguation |
| `src/eager.ts` | `@Eager()` — opt-in eager instantiation |
| `src/module.ts` | `@Module({ imports? })` — groups `@Provides` factory methods |
| `src/provides.ts` | `@Provides()` — marks method in a @Module as a bean factory |
| `src/inject.ts` | `@Inject(qualifier?)` — accessor field injection |
| `src/optional.ts` | `@Optional()` — marks accessor field as optional |

## META Keys (metadata.ts)

All are Symbols under the `META` object:
- `SCOPE` — `'singleton'` or `'prototype'`
- `NAME` — qualifier string
- `EAGER` — boolean
- `MODULE` — `{ imports: [] }`
- `PROVIDES` — array of `{ methodName }`
- `INJECT` — array of `{ fieldName, qualifier }`
- `OPTIONAL` — array of `{ fieldName }`

## Stage 3 Decorator Pattern

**Native Stage 3 decorators** — NOT `experimentalDecorators`. Key differences:
- No parameter decorators exist in Stage 3
- `@Inject` and `@Optional` use the `accessor` keyword on class fields
- Metadata is stored on `context.metadata` (backed by `Symbol.metadata`)
- `setMeta()` writes a single value, `pushMeta()` appends to an array

```typescript
@Singleton()
class UserService {
  @Inject('users') accessor userRepo!: Repository<User>;
  @Optional() accessor logger?: Logger;
}
```

## Gotchas

- Constructor parameter injection is handled by the transformer (AST analysis), not by decorators
- `Symbol.metadata` is polyfilled at the top of `metadata.ts` for environments that lack it
- `@Provides()` is a method decorator, only valid inside a `@Module()` class
