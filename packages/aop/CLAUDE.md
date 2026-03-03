# @goodie-ts/aop

AOP foundation for goodie-ts. Provides interceptor chain execution, advice wrappers, and the `@Before`/`@Around`/`@After` decorators. Other packages (logging, cache, resilience, kysely) build their interceptors on top of this.

## Key Files

| File | Role |
|------|------|
| `src/types.ts` | `MethodInterceptor`, `InvocationContext`, `BeforeAdvice`, `AfterAdvice`, `InterceptorRef`, `InterceptedMethodDescriptor` |
| `src/interceptor-chain.ts` | `buildInterceptorChain()` — chains interceptors with proceed/original-method fallback |
| `src/advice-wrappers.ts` | `wrapBeforeAdvice()`, `wrapAfterAdvice()` — adapt advice to `MethodInterceptor` |
| `src/aop-transformer-plugin.ts` | `createAopPlugin()` — scans `@Around/@Before/@After`, populates `interceptedMethods` metadata |
| `src/decorators/around.ts` | `@Around(InterceptorClass, { order? })` |
| `src/decorators/before.ts` | `@Before(AdviceClass, { order? })` |
| `src/decorators/after.ts` | `@After(AdviceClass, { order? })` |

## Core Types

- **`MethodInterceptor`** — `{ intercept(ctx: InvocationContext): unknown }` — full-control wrapper
- **`InvocationContext`** — `{ className, methodName, args, target, proceed(), metadata? }`
- **`BeforeAdvice`** — `{ before(ctx: AdviceContext): void }` — runs before, cannot modify args
- **`AfterAdvice`** — `{ after(ctx: AdviceContext, result): void }` — runs after, receives result
- **`InterceptorRef`** — metadata entry: `{ className, importPath, adviceType, order, metadata? }`
- **`InterceptedMethodDescriptor`** — `{ methodName, interceptors: InterceptorRef[] }`

## How It Works

1. **Compile time:** `createAopPlugin()` scans `@Around`/`@Before`/`@After` decorators via `visitMethod`. Resolves interceptor classes via ts-morph. Stores `interceptedMethods` in bean metadata during `afterResolve`.
2. **Code generation:** The `codegen` hook emits `import { buildInterceptorChain } from '@goodie-ts/aop'`. The transformer's codegen uses `interceptedMethods` metadata to generate chain-building code inside factory functions.
3. **Runtime:** `buildInterceptorChain()` wraps the original method. Each interceptor calls `ctx.proceed()` to invoke the next interceptor or the original method.

## Interceptor Order

Lower `order` values run first (outermost). Convention used by built-in interceptors:
- `-100` — logging (outermost, sees everything)
- `-50` — timeout
- `-30` — circuit breaker
- `-40` — transactional
- `-10` — retry (innermost, retries only the method)
- `0` — cache

## Gotchas

- Interceptors are normal beans — they must be registered in the DI container (plugin packages synthesize them automatically)
- `proceed()` must be called exactly once in an `@Around` interceptor (or the method is short-circuited)
- Async advice on sync methods changes the return type to `Promise<T>`
- Per-interceptor metadata (e.g. cache name, timeout duration) is passed via `ctx.metadata`
