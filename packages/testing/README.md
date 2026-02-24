# @goodie-ts/testing

Test utilities for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) with bean overrides and mock definitions.

## Install

```bash
pnpm add -D @goodie-ts/testing
```

## Overview

Provides `TestContext` for creating isolated `ApplicationContext` instances with bean overrides — perfect for unit and integration tests.

## Usage

```typescript
import { TestContext } from '@goodie-ts/testing';
import { definitions } from './AppContext.generated.js';

const ctx = await TestContext.from(definitions)
  .override(UserRepoToken).withValue(new MockUserRepo())
  .override(LoggerToken).withFactory(() => new TestLogger())
  .build();

const service = ctx.get(UserService);
```

## API

### TestContext.from(definitions | context)

Creates a `TestContextBuilder` from bean definitions or an existing context.

- `.override(token).withValue(instance)` — replace with a fixed value
- `.override(token).with(MockClass)` — replace with a zero-dep class
- `.override(token).withFactory(() => ...)` — replace with a custom factory
- `.mock(MockClass, ...)` — register `@MockDefinition` classes
- `.build()` — returns a `Promise<ApplicationContext>`

### @MockDefinition(target)

Decorator that marks a class as a mock replacement for a specific token:

```typescript
import { MockDefinition } from '@goodie-ts/testing';

@MockDefinition(UserRepoToken)
class MockUserRepo extends UserRepository {
  findAll() { return [{ id: 'mock', name: 'Test User' }]; }
}

const ctx = await TestContext.from(definitions)
  .mock(MockUserRepo)
  .build();
```

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
