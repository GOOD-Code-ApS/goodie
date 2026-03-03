# @goodie-ts/aop

Aspect-oriented programming support for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) — interceptor chain, advice wrappers, and `@Before`/`@Around`/`@After` decorators.

## Install

```bash
pnpm add @goodie-ts/aop
```

## Overview

Provides the AOP foundation that other goodie-ts packages build on (logging, cache, resilience, kysely). You can also write custom interceptors.

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@Around(InterceptorClass, { order? })` | method | Full-control interceptor — wraps entire method execution |
| `@Before(AdviceClass, { order? })` | method | Runs before the method (cannot modify args) |
| `@After(AdviceClass, { order? })` | method | Runs after the method (receives result) |

## Writing a Custom Interceptor

```typescript
import type { MethodInterceptor, InvocationContext } from '@goodie-ts/aop';
import { Singleton } from '@goodie-ts/decorators';

@Singleton()
class TimingInterceptor implements MethodInterceptor {
  async intercept(ctx: InvocationContext) {
    const start = performance.now();
    const result = await ctx.proceed();
    console.log(`${ctx.methodName} took ${performance.now() - start}ms`);
    return result;
  }
}

@Singleton()
class MyService {
  @Around(TimingInterceptor)
  async doWork() { /* ... */ }
}
```

## Interceptor Order

Lower `order` runs first (outermost). Built-in convention:

| Order | Interceptor |
|-------|-------------|
| -100 | Logging |
| -50 | Timeout |
| -40 | Transactional |
| -30 | Circuit breaker |
| -10 | Retry |
| 0 | Cache |

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
