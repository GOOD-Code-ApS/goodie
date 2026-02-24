# @goodie-ts/testing

Test utilities for overriding beans in `ApplicationContext` during tests.

## Key Files

| File | Role |
|------|------|
| `src/test-context.ts` | `TestContext.from()` → `TestContextBuilder` with fluent override API |
| `src/mock-definition.ts` | `@MockDefinition(target)` decorator and `getMockTarget()` |

## TestContext API

```typescript
const ctx = await TestContext.from(definitions)   // or from(existingContext)
  .override(SomeToken).withValue(mockInstance)     // fixed value
  .override(OtherToken).with(MockClass)            // zero-dep class
  .override(ThirdToken).withFactory(() => new T())  // custom factory
  .mock(MockUserRepo, MockOrderRepo)               // @MockDefinition classes
  .build();                                         // → Promise<ApplicationContext>
```

- `override(token)` returns `OverrideBuilder<T>` with `.withValue()`, `.with()`, `.withFactory()`
- Throws `OverrideError` if the token doesn't exist in the base definitions
- Each `.build()` creates a fully isolated `ApplicationContext`

## @MockDefinition Pattern

```typescript
@MockDefinition(Repository_User_Token)    // target: Constructor | InjectionToken | string
class MockUserRepository extends Repository<User> {
  constructor() {
    super();
    this.add(new User('mock-1', 'Mock Alice'));
  }
}
```

- `.mock(MockClass)` reads metadata, resolves target, registers as zero-dep singleton override
- Target can be a class, `InjectionToken`, or string (matched by token description)
- Metadata stored under `Symbol('goodie:mock-target')`

## Gotchas

- All overrides produce zero-dependency singleton beans (the override replaces the full factory)
- `override()` validates the token exists — you can't add new beans, only replace existing ones
- Each `build()` is independent — overrides in one builder don't affect others
