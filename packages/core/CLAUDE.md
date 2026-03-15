# @goodie-ts/core

Runtime DI container, decorators, and AOP runtime. Resolves pre-built `ComponentDefinition[]` and provides the interceptor chain for AOP.

## Key Files

| File | Role |
|------|------|
| `src/application-context.ts` | Container: `create()`, `get()`, `getAsync()`, `getAll()`, `close()` |
| `src/component-definition.ts` | `ComponentDefinition<T>` and `Dependency` interfaces |
| `src/injection-token.ts` | `InjectionToken<T>` — typed token with phantom type field |
| `src/goodie.ts` | `Goodie.build(defs)` → `GoodieBuilder` → `.start()` bootstrap |
| `src/topo-sort.ts` | DFS topological sort with cycle detection |
| `src/errors.ts` | `DIError` hierarchy |
| `src/aop-types.ts` | AOP types: `MethodInterceptor`, `InvocationContext`, `BeforeAdvice`, `AfterAdvice`, `InterceptorRef`, `InterceptedMethodDescriptor` |
| `src/interceptor-chain.ts` | `buildInterceptorChain()` — chains interceptors with proceed/original-method fallback |
| `src/advice-wrappers.ts` | `wrapBeforeAdvice()`, `wrapAfterAdvice()` — adapt advice to `MethodInterceptor` |
| `src/on-start.ts` | `OnStart` — abstract lifecycle class for post-startup hooks, discovered via `baseTokens` |
| `src/decorators/` | All decorators: `@Singleton`, `@Transient`, `@Inject`, `@Factory`, `@Provides`, `@Value`, `@Around`, `@Before`, `@After`, `@Config`, `@Introspected`, `@Order()`, `createAopDecorator()`, lifecycle hooks |
| `src/introspection.ts` | `TypeMetadata`, `IntrospectedField`, `FieldType` (recursive tree), `DecoratorMeta`, `MetadataRegistry` |

## Core Types

- **`Scope`**: `'singleton' | 'transient'`
- **`ComponentDefinition<T>`**: `{ token, scope, dependencies, factory, eager, metadata }`
- **`Dependency`**: `{ token, optional }`
- **`InjectionToken<T>`**: class with `description` string and phantom `__type` for type safety
- **`ComponentPostProcessor`**: `{ beforeInit?, afterInit? }` — hooks called during instantiation. Discovered via `metadata.isComponentPostProcessor = true`.
- **`TypeMetadata<T>`**: `{ type, className, fields }` — compile-time generated introspection for `@Introspected` classes (NOT components — value objects/DTOs)
- **`IntrospectedField`**: `{ name, type: FieldType, decorators: DecoratorMeta[] }` — field with recursive type tree and generic decorator metadata
- **`FieldType`**: recursive union: `primitive | literal | array | reference | union | optional | nullable`
- **`DecoratorMeta`**: `{ name, args }` — generic, decorator-agnostic. Consumers (validation, OpenAPI) interpret recognized decorators.
- **`MetadataRegistry`**: runtime `Map`-based registry — `register()`, `get(type)`, `has(type)`, `getAll()`, `registerMethodParams(target, methodName, types)`, `getMethodParams(target, methodName)`

## ApplicationContext API

- `ApplicationContext.create(defs, options?)` — async factory, evaluates `metadata.conditionalRules` to filter conditional components (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissing`) before topo sort, validates, eagerly inits marked components
- `get(token)` — sync, throws `AsyncComponentNotReadyError` if component is async and unresolved
- `getAsync(token)` — always safe for async components
- `getAll(token)` — returns all components registered under a token
- `close()` — tears down context, rejects subsequent calls with `ContextClosedError`

## Error Messages

- **Fuzzy suggestions**: All `MissingDependencyError` throws (startup validation, `get()`/`getAsync()`, dep resolution) suggest similar registered token names via Levenshtein distance ("Did you mean: UserService?")
- **Conditional component hints**: When a missing dependency was excluded by a conditional rule, the error explains why ("component exists but was excluded by: @ConditionalOnProperty('datasource.dialect', 'postgres') — property is 'mysql'")
- **`requiredBy` context**: All missing dependency errors include which component required the missing dep
- **Lifecycle error wrapping**: `@OnInit` and `@OnDestroy` errors include component name, method name, and the original error via `{ cause }`
- **`MissingDependencyError`**: has `tokenDescription`, `requiredBy?`, and `hint?` fields

## Gotchas

- `get()` on an async component that hasn't resolved yet throws — always use `getAsync()` for async factories
- `Goodie.build(defs).start()` is the intended bootstrap path (wraps `ApplicationContext.create`). After context creation, discovers all `OnStart` components via `baseTokens`, sorts by `@Order()` metadata, and calls `onStart(ctx)` on each.
- Optional dependencies resolve to `undefined` when missing, not `null`
