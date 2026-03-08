# @goodie-ts/core

Runtime DI container, decorators, and AOP runtime. Resolves pre-built `BeanDefinition[]` and provides the interceptor chain for AOP.

## Key Files

| File | Role |
|------|------|
| `src/application-context.ts` | Container: `create()`, `get()`, `getAsync()`, `getAll()`, `close()` |
| `src/bean-definition.ts` | `BeanDefinition<T>` and `Dependency` interfaces |
| `src/injection-token.ts` | `InjectionToken<T>` — typed token with phantom type field |
| `src/goodie.ts` | `Goodie.build(defs)` → `GoodieBuilder` → `.start()` bootstrap |
| `src/topo-sort.ts` | DFS topological sort with cycle detection |
| `src/errors.ts` | `DIError` hierarchy |
| `src/aop-types.ts` | AOP types: `MethodInterceptor`, `InvocationContext`, `BeforeAdvice`, `AfterAdvice`, `InterceptorRef`, `InterceptedMethodDescriptor` |
| `src/interceptor-chain.ts` | `buildInterceptorChain()` — chains interceptors with proceed/original-method fallback |
| `src/advice-wrappers.ts` | `wrapBeforeAdvice()`, `wrapAfterAdvice()` — adapt advice to `MethodInterceptor` |
| `src/decorators/` | All decorators: `@Singleton`, `@Injectable`, `@Inject`, `@Module`, `@Provides`, `@Value`, `@Around`, `@Before`, `@After`, `@ConfigurationProperties`, `createAopDecorator()`, lifecycle hooks |

## Core Types

- **`Scope`**: `'singleton' | 'prototype'`
- **`BeanDefinition<T>`**: `{ token, scope, dependencies, factory, eager, metadata }`
- **`Dependency`**: `{ token, optional }`
- **`InjectionToken<T>`**: class with `description` string and phantom `__type` for type safety
- **`BeanPostProcessor`**: `{ beforeInit?, afterInit? }` — hooks called during instantiation. Discovered via `metadata.isBeanPostProcessor = true`.

## ApplicationContext API

- `ApplicationContext.create(defs, options?)` — async factory, topo-sorts (unless `{ preSorted: true }`), validates, eagerly inits marked beans
- `get(token)` — sync, throws `AsyncBeanNotReadyError` if bean is async and unresolved
- `getAsync(token)` — always safe for async beans
- `getAll(token)` — returns all beans registered under a token
- `close()` — tears down context, rejects subsequent calls with `ContextClosedError`

## Gotchas

- `get()` on an async bean that hasn't resolved yet throws — always use `getAsync()` for async factories
- `Goodie.build(defs).start()` is the intended bootstrap path (wraps `ApplicationContext.create`)
- Optional dependencies resolve to `undefined` when missing, not `null`
