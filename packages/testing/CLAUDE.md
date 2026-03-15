# @goodie-ts/testing

Test utilities for overriding components in `ApplicationContext` during tests.

## Key Files

| File | Role |
|------|------|
| `src/test-context.ts` | `TestContext.from()` → `TestContextBuilder` with fluent override API |
| `src/mock-definition.ts` | `@MockDefinition(target)` decorator and `getMockTarget()` |
| `src/vitest.ts` | `createGoodieTest()` — Vitest-native fixtures with `ctx`, `resolve`, custom fixtures, transactional rollback |

## createGoodieTest() (Vitest Fixtures)

```typescript
const test = createGoodieTest(buildDefinitions, {
  config: () => ({ 'datasource.url': container.getConnectionUri() }),
  fixtures: {
    app: (ctx) => createRouter(ctx),
  },
  transactional: TransactionManager,
  setup: (b) => b.provide(SECURITY_PROVIDER, testSecurityProvider),
});

test('GET /todos', async ({ app, resolve }) => {
  const res = await app.request('/api/todos');
  expect(res.status).toBe(200);
});
```

- Accepts `DefinitionsFactory | ComponentDefinition[]` — when a function, config is passed through before component construction
- `fixtures` option: custom fixtures derived from the ApplicationContext (e.g. `app: (ctx) => createRouter(ctx)`)
- `setup` option: customise the builder (`.override()`, `.mock()`, `.provide()`)
- `transactional` option: wrap each test in a rollback transaction
- Built-in fixtures: `ctx` (ApplicationContext, fresh per test), `resolve` (shorthand for `ctx.get()`)

## TestContext API

```typescript
const ctx = await TestContext.from(definitions)   // or from(existingContext)
  .override(SomeToken).withValue(mockInstance)     // fixed value
  .override(OtherToken).with(MockClass)            // zero-dep class
  .override(ThirdToken).withFactory(() => new T())  // custom factory
  .override(FourthToken).withDeps((dep) => ...)     // replace factory, keep deps
  .provide(NewToken, value)                         // add a new test-only component
  .mock(MockUserRepo, MockOrderRepo)               // @MockDefinition classes
  .withConfig({ key: 'value' })                     // override config keys
  .build();                                         // → Promise<ApplicationContext>
```

- `override(token)` returns `OverrideBuilder<T>` with `.withValue()`, `.with()`, `.withFactory()`, `.withDeps()`
- `provide(token, value)` adds a new component (doesn't require the token to exist)
- Throws `OverrideError` if `override()` target doesn't exist in the base definitions
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
- Metadata stored as `__mockTarget` static property on the class

## Gotchas

- All overrides produce zero-dependency singleton components (the override replaces the full factory)
- `override()` validates the token exists — you can't add new components, only replace existing ones (use `provide()` for that)
- Each `build()` is independent — overrides in one builder don't affect others
- When `createGoodieTest` receives a `DefinitionsFactory`, config is passed to the factory directly — `withConfig()` is only used for the raw `ComponentDefinition[]` path
