# @goodie-ts/testing

Test utilities for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) with bean overrides, mock definitions, and Vitest fixtures.

## Install

```bash
pnpm add -D @goodie-ts/testing
```

## Overview

Provides `createGoodieTest()` for Vitest-native fixtures and `TestContext` for creating isolated `ApplicationContext` instances with bean overrides.

## Vitest Fixtures (recommended)

```typescript
import { createGoodieTest } from '@goodie-ts/testing/vitest';
import { buildDefinitions, createRouter } from './AppContext.generated.js';

const test = createGoodieTest(buildDefinitions, {
  config: () => ({ 'datasource.url': container.getConnectionUri() }),
  fixtures: {
    app: (ctx) => createRouter(ctx),
  },
  setup: (b) => b.provide(SECURITY_PROVIDER, testSecurityProvider),
});

test('GET /todos returns todos', async ({ app, resolve }) => {
  const res = await app.request('/api/todos');
  expect(res.status).toBe(200);
});

test('resolves beans directly', async ({ resolve }) => {
  const svc = resolve(UserService);
  expect(svc).toBeInstanceOf(UserService);
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `config` | `Record \| () => Record` | Config overrides (passed to `buildDefinitions` when using a function) |
| `fixtures` | `Record<string, (ctx) => T>` | Custom fixtures derived from the context |
| `setup` | `(builder) => builder` | Customise the builder (`.override()`, `.mock()`, `.provide()`) |
| `transactional` | `Constructor \| InjectionToken` | Wrap each test in a rollback transaction |
| `rollback` | `boolean` | Whether to rollback (default: `true` when `transactional` is set) |

### Built-in Fixtures

| Fixture | Type | Description |
|---------|------|-------------|
| `ctx` | `ApplicationContext` | Fresh context per test, closed after |
| `resolve` | `(token) => T` | Shorthand for `ctx.get(token)` |

## TestContext API

For lower-level control without Vitest fixtures:

```typescript
import { TestContext } from '@goodie-ts/testing';
import { buildDefinitions } from './AppContext.generated.js';

const ctx = await TestContext.from(buildDefinitions())
  .override(UserRepoToken).withValue(new MockUserRepo())
  .provide(SECURITY_PROVIDER, testSecurityProvider)
  .build();

const service = ctx.get(UserService);
```

### Builder Methods

- `.override(token).withValue(instance)` — replace with a fixed value
- `.override(token).with(MockClass)` — replace with a zero-dep class
- `.override(token).withFactory(() => ...)` — replace with a custom factory
- `.override(token).withDeps((dep0, dep1) => ...)` — replace factory, keep dependencies
- `.provide(token, value)` — add a new test-only bean
- `.mock(MockClass, ...)` — register `@MockDefinition` classes
- `.withConfig({ key: value })` — override config keys
- `.build()` — returns `Promise<ApplicationContext>`

### @MockDefinition(target)

Decorator that marks a class as a mock replacement for a specific token:

```typescript
import { MockDefinition } from '@goodie-ts/testing';

@MockDefinition(UserRepoToken)
class MockUserRepo extends UserRepository {
  findAll() { return [{ id: 'mock', name: 'Test User' }]; }
}

const ctx = await TestContext.from(buildDefinitions())
  .mock(MockUserRepo)
  .build();
```

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
