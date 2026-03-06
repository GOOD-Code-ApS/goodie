---
"@goodie-ts/core": minor
"@goodie-ts/transformer": minor
"@goodie-ts/cache": patch
"@goodie-ts/logging": patch
"@goodie-ts/resilience": patch
"@goodie-ts/health": patch
---

Consolidate `@goodie-ts/decorators`, `@goodie-ts/aop`, and `@goodie-ts/config` into core packages.

**BREAKING:** `@goodie-ts/decorators`, `@goodie-ts/aop`, and `@goodie-ts/config` no longer exist. All exports are now available from `@goodie-ts/core`.

Migration: replace all imports from `@goodie-ts/decorators`, `@goodie-ts/aop`, or `@goodie-ts/config` with `@goodie-ts/core`.

```diff
- import { Singleton, Inject } from '@goodie-ts/decorators';
+ import { Singleton, Inject } from '@goodie-ts/core';

- import { createAopDecorator, Around } from '@goodie-ts/decorators';
+ import { createAopDecorator, Around } from '@goodie-ts/core';

- import { buildInterceptorChain } from '@goodie-ts/aop';
+ import { buildInterceptorChain } from '@goodie-ts/core';

- import { ConfigurationProperties } from '@goodie-ts/config';
+ import { ConfigurationProperties } from '@goodie-ts/core';
```

AOP and config transformer plugins are now built-in to `@goodie-ts/transformer` — no need to pass them explicitly.
