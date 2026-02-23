# @goodie/core

Runtime DI container. No compile-time or decorator concerns — this package only resolves pre-built `BeanDefinition[]`.

## Key Files

| File | Role |
|------|------|
| `src/application-context.ts` | Container: `create()`, `get()`, `getAsync()`, `getAll()`, `close()` |
| `src/bean-definition.ts` | `BeanDefinition<T>` and `Dependency` interfaces |
| `src/injection-token.ts` | `InjectionToken<T>` — typed token with phantom type field |
| `src/goodie.ts` | `Goodie.build(defs)` → `GoodieBuilder` → `.start()` bootstrap |
| `src/topo-sort.ts` | DFS topological sort with cycle detection |
| `src/errors.ts` | `DIError` hierarchy |

## Core Types

- **`Scope`**: `'singleton' | 'prototype'`
- **`BeanDefinition<T>`**: `{ token, scope, dependencies, factory, eager, metadata }`
- **`Dependency`**: `{ token, optional }`
- **`InjectionToken<T>`**: class with `description` string and phantom `__type` for type safety
- **`BeanPostProcessor`**: `{ beforeInit?, afterInit? }` — hooks called during instantiation. Discovered via `metadata.isBeanPostProcessor = true`.

## ApplicationContext API

- `ApplicationContext.create(defs)` — async factory, topo-sorts, validates, eagerly inits marked beans
- `get(token)` — sync, throws `AsyncBeanNotReadyError` if bean is async and unresolved
- `getAsync(token)` — always safe for async beans
- `getAll(token)` — returns all beans registered under a token
- `close()` — tears down context, rejects subsequent calls with `ContextClosedError`

## Gotchas

- `get()` on an async bean that hasn't resolved yet throws — always use `getAsync()` for async factories
- `Goodie.build(defs).start()` is the intended bootstrap path (wraps `ApplicationContext.create`)
- Optional dependencies resolve to `undefined` when missing, not `null`
