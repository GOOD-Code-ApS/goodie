# examples/basic

End-to-end smoke test demonstrating the full goodie-ts pipeline: decorators → transformer → generated code → runtime.

## What It Demonstrates

- `@Module` + `@Provides` for factory-based bean creation
- `@Singleton` classes with constructor injection
- Generic type handling: `Repository<User>`, `Repository<Order>`
- Primitive token: `appName` → `App_Name_Token`
- Testing with `@MockDefinition` and `TestContext`

## Key Files

| File | Role |
|------|------|
| `src/AppModule.ts` | `@Module` with `@Provides` methods for repositories and appName |
| `src/UserService.ts` | `@Singleton`, depends on `Repository<User>` |
| `src/OrderService.ts` | `@Singleton`, depends on `Repository<Order>` |
| `src/Repository.ts` | Generic in-memory store (not decorated, provided via module) |
| `src/model.ts` | `User` and `Order` data classes |
| `src/main.ts` | Bootstrap: `app.start()` → use services → `ctx.close()` |
| `src/AppContext.generated.ts` | **Generated** — gitignored, created by vite build or transformer |

## Generated File

`AppContext.generated.ts` exports:
- `Repository_User_Token`, `Repository_Order_Token`, `App_Name_Token` — typed `InjectionToken`s
- `definitions` — `BeanDefinition[]` array
- `createContext()` — async factory
- `app` — `Goodie.build(definitions)` ready to `.start()`

## Test Pattern

```typescript
@MockDefinition(Repository_User_Token)
class MockUserRepository extends Repository<User> { ... }

const ctx = await TestContext.from(definitions)
  .mock(MockUserRepository)
  .build();
```

Tests verify mock isolation, multiple overrides, and context independence.

## Conventions

- `vite.config.ts` uses `diPlugin()` with default options
- The generated file is regenerated on every build — never hand-edit it
- Import tokens from the generated file, not from decorators
