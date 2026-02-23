# TypeScript Compile-Time Dependency Injection Framework

> A compile-time dependency injection framework for TypeScript.
> Core DI only — designed for extension via `BeanPostProcessor` and `BeanDefinition` hooks.

---

## Goals

- **Compile-time wiring**: Resolve the full dependency graph at build time, not runtime. No `reflect-metadata` hacks.
- **Zero runtime overhead**: The generated application context is just plain TypeScript factory code.
- **Type-safe**: Injection tokens are typed. `ctx.get(UserService)` returns `UserService`, not `unknown`.
- **Open for extension**: AOP, interceptors, caching, validation — all achievable by third parties without touching the core.
- **Excellent errors**: Source-mapped, pointing to the exact line in user code, not in generated files.
- **Testable**: First-class `TestContext` with bean overrides.

## Non-Goals (for v1.0)

- AOP / interceptors / proxies (intentionally descoped — see Extension Points)
- ESBuild / Webpack / Rollup integrations (Vite only for now)
- CLI scaffolding
- Framework adapters (Express, Fastify, etc.) — these are userland concerns

---

## Architecture Overview

```
User Source Code
      │
      ▼
┌─────────────────────────┐
│   TypeScript Transformer │  ← ts-morph, runs at build time
│   (AST walker + resolver)│
└────────────┬────────────┘
             │  emits
             ▼
┌─────────────────────────┐
│   Generated Context File │  ← AppContext.generated.ts
│   (plain TS factory code)│
└────────────┬────────────┘
             │  imported by
             ▼
┌─────────────────────────┐
│   Runtime ApplicationContext  │  ← thin wrapper, scope management, BeanPostProcessor
└─────────────────────────┘
```

The transformer does the hard work. The runtime is intentionally thin.

---

## Core Data Model

### InjectionToken

The typed handle used to look up beans. Avoids stringly-typed lookups.

```typescript
class InjectionToken<T> {
  constructor(readonly description: string) {}
}

// Tokens are either:
// 1. The class constructor itself (most common)
// 2. An explicit InjectionToken for interfaces or primitives
const DB_URL = new InjectionToken<string>('DB_URL')
```

### BeanDefinition

The central metadata structure. Rich enough for extension authors to build on top of.

```typescript
interface BeanDefinition<T = unknown> {
  token: InjectionToken<T> | Constructor<T>
  scope: 'singleton' | 'prototype'
  dependencies: Array<InjectionToken<unknown> | Constructor<unknown>>
  factory: (...deps: unknown[]) => T | Promise<T>
  // Arbitrary metadata stashed by decorators — AOP libraries use this
  metadata: Record<string, unknown>
}
```

### ApplicationContext

```typescript
interface ApplicationContext {
  get<T>(token: Constructor<T> | InjectionToken<T>): T
  getAsync<T>(token: Constructor<T> | InjectionToken<T>): Promise<T>
  getAll<T>(token: Constructor<T> | InjectionToken<T>): T[]
  close(): Promise<void>
}
```

---

## Decorators

Decorators are the user-facing API. They attach metadata that the transformer reads.

```typescript
// Mark a class as injectable (prototype scope by default)
@Injectable()
class UserRepository { ... }

// Singleton scope
@Singleton()
class UserService {
  constructor(private repo: UserRepository) {}
}

// Disambiguate when multiple implementations exist
@Named('primary')
@Singleton()
class PrimaryUserRepository implements UserRepository { ... }

// Inject by name at the call site
@Singleton()
class UserService {
  constructor(@Inject('primary') private repo: UserRepository) {}
}

// Inject a raw InjectionToken value
@Singleton()
class DatabaseClient {
  constructor(@Inject(DB_URL) private url: string) {}
}

// Optional dependency — resolves to undefined if not registered
@Singleton()
class MetricsService {
  constructor(@Optional() private tracer?: Tracer) {}
}

// Provide a value or factory without a class
@Module()
class AppModule {
  @Provides()
  dbUrl(): string {
    return process.env.DATABASE_URL!
  }

  @Provides()
  @Singleton()
  databaseClient(url: string): DatabaseClient {
    return new DatabaseClient(url)
  }
}
```

---

## Compile-Time Transformer

The transformer is the core of the framework. It runs as part of the TypeScript compilation step.

### What it does

1. **Scans** all source files for classes decorated with `@Injectable`, `@Singleton`, `@Module`, etc.
2. **Resolves** constructor parameter types using `ts-morph`'s type checker — this is where generic type resolution happens (`Repository<User>` → correct token).
3. **Builds** a dependency graph (directed acyclic graph of `BeanDefinition` nodes).
4. **Detects** circular dependencies — emits a compile error with the full cycle path and source locations.
5. **Topologically sorts** the graph to determine instantiation order.
6. **Emits** a generated `AppContext.generated.ts` file containing typed factory code.

### Generated output (conceptual)

```typescript
// AppContext.generated.ts — you never write or edit this
import { ApplicationContext, BeanDefinition } from 'ts-di-framework'
import { UserRepository } from './UserRepository'
import { UserService } from './UserService'

export const definitions: BeanDefinition[] = [
  {
    token: UserRepository,
    scope: 'prototype',
    dependencies: [],
    factory: () => new UserRepository(),
    metadata: {}
  },
  {
    token: UserService,
    scope: 'singleton',
    dependencies: [UserRepository],
    factory: (repo: UserRepository) => new UserService(repo),
    metadata: {}
  }
]

export const AppContext = ApplicationContext.fromDefinitions(definitions)
```

The generated code is valid, readable TypeScript. It source-maps cleanly back to user code.

### Generic type resolution

This is the hardest problem. `ts-morph` exposes the full TypeScript type checker, which means we can resolve `Repository<User>` to a specific token by walking the type arguments. The transformer will:

- Canonicalise generic types to a stable string key: `Repository<User>` → `"Repository<User>"`
- Generate a corresponding `InjectionToken` with that key
- Require that any `@Provides` method producing a `Repository<User>` uses the same canonical token

Edge cases to handle:
- Type aliases (`type UserRepo = Repository<User>`)
- Re-exports and barrel files
- Interfaces (resolved to `InjectionToken` since they have no runtime representation)
- Union types in optional deps (`Service | undefined`)

---

## Scopes

### Singleton

One instance per `ApplicationContext`. Created lazily on first `get()`, then cached.

### Prototype

A new instance on every `get()`.

### Request (future / extension)

Not in v1.0 core. Can be implemented by a `BeanPostProcessor` that manages a request-scoped cache keyed by async context (e.g. `AsyncLocalStorage`).

---

## Extension Points

This is how AOP, interceptors, caching, validation, etc. are built **without modifying the core**.

### BeanPostProcessor (runtime)

Called by `ApplicationContext` after every bean is created. Extension libraries implement this interface.

```typescript
interface BeanPostProcessor {
  // Called before init methods run. Can return a replacement (e.g. a Proxy).
  beforeInit?<T>(bean: T, definition: BeanDefinition<T>): T | Promise<T>
  // Called after init methods run.
  afterInit?<T>(bean: T, definition: BeanDefinition<T>): T | Promise<T>
}
```

**Example — a hypothetical AOP library:**
```typescript
class InterceptorPostProcessor implements BeanPostProcessor {
  afterInit<T>(bean: T, definition: BeanDefinition<T>): T {
    const interceptors = definition.metadata['interceptors'] as Interceptor[]
    if (!interceptors?.length) return bean
    return createProxy(bean, interceptors)
  }
}

// Registered in your module:
@Module()
class AopModule {
  @Provides()
  @Singleton()
  interceptorProcessor(): BeanPostProcessor {
    return new InterceptorPostProcessor()
  }
}
```

The core automatically discovers all `BeanPostProcessor` beans and calls them in registration order.

### Transformer plugin API (compile-time)

Extension libraries can hook into the compile-time transformer to stash metadata into `BeanDefinition.metadata`. This is how an `@Transactional` decorator would record which methods need interception.

```typescript
// Defined by the framework, implemented by extension authors
interface TransformerPlugin {
  // Called for each decorated class node during AST traversal
  visitClass?(node: ClassDeclaration, context: TransformerContext): void
  // Called for each decorated method
  visitMethod?(node: MethodDeclaration, context: TransformerContext): void
}

interface TransformerContext {
  // Stash arbitrary metadata onto the BeanDefinition being built
  addMetadata(key: string, value: unknown): void
  // Emit a compile error pointing at a specific AST node
  emitError(node: Node, message: string): void
}
```

Plugins are registered in `vite.config.ts`:

```typescript
import { diPlugin } from 'ts-di-framework/vite'
import { aopPlugin } from 'ts-di-aop/transformer-plugin'

export default defineConfig({
  plugins: [
    diPlugin({
      transformerPlugins: [aopPlugin()]
    })
  ]
})
```

---

## Vite Integration

The Vite plugin wraps the transformer and handles watch mode.

```typescript
// vite.config.ts
import { diPlugin } from 'ts-di-framework/vite'

export default defineConfig({
  plugins: [
    diPlugin({
      // Entry point(s) — transformer starts scanning from here
      entryPoints: ['src/main.ts'],
      // Where to emit the generated context file
      outputFile: 'src/AppContext.generated.ts',
      // Optional transformer plugins (see Extension Points)
      transformerPlugins: []
    })
  ]
})
```

### Watch mode behaviour

The Vite plugin tracks which source files contributed beans to the dependency graph. When a file changes:

1. Re-scan only the changed file and its dependents
2. Rebuild the affected subgraph
3. Regenerate only the portions of `AppContext.generated.ts` that changed
4. Trigger HMR as normal

Full regeneration is the safe fallback if incremental tracking gets confused.

---

## Testing Utilities

First-class testing support. Swap any bean with a mock, without touching production wiring.

```typescript
import { TestContext } from 'ts-di-framework/testing'
import { AppContext } from './AppContext.generated'

describe('UserService', () => {
  it('creates a user', async () => {
    const mockRepo = { save: vi.fn().mockResolvedValue({ id: '1' }) }

    const ctx = await TestContext.from(AppContext)
      .override(UserRepository).withValue(mockRepo)
      .override(EmailService).with(MockEmailService)
      .build()

    const svc = ctx.get(UserService)
    await svc.createUser({ name: 'Alice' })

    expect(mockRepo.save).toHaveBeenCalledWith({ name: 'Alice' })
  })
})
```

`TestContext` is fully typed — `.override(UserRepository)` knows the override must satisfy the `UserRepository` interface.

### TestContext API

```typescript
class TestContext {
  static from(context: ApplicationContext): TestContextBuilder

  // Returns a fresh builder each time — contexts don't bleed between tests
}

class TestContextBuilder {
  override<T>(token: Constructor<T> | InjectionToken<T>): OverrideBuilder<T>
  build(): Promise<ApplicationContext>
}

class OverrideBuilder<T> {
  withValue(value: T): TestContextBuilder          // literal value
  with(cls: Constructor<T>): TestContextBuilder    // replacement class
  withFactory(fn: () => T): TestContextBuilder     // factory fn
}
```

---

## Error Design

Errors point to the user's source file, never to generated code.

### Circular dependency

```
Error: Circular dependency detected

  UserService → OrderService → UserService

  src/UserService.ts:8:3
    constructor(private orders: OrderService) {}
                               ^^^^^^^^^^^^
  src/OrderService.ts:5:3
    constructor(private users: UserService) {}
                               ^^^^^^^^^^^
```

### Missing provider

```
Error: No provider registered for DatabaseClient

  Required by: UserRepository (src/UserRepository.ts:12:3)

  Did you forget to add @Injectable() to DatabaseClient,
  or to include it in a @Module()?
```

### Ambiguous provider (multiple implementations)

```
Error: Multiple providers found for UserRepository

  - PrimaryUserRepository (src/PrimaryUserRepository.ts)
  - TestUserRepository (src/TestUserRepository.ts)

  Use @Named('name') on the providers and @Inject('name') at the injection site.
```

---

## Package Structure

```
ts-di-framework/
├── packages/
│   ├── core/               # Runtime: ApplicationContext, BeanDefinition, InjectionToken
│   ├── decorators/         # @Injectable, @Singleton, @Named, @Inject, @Optional, @Module, @Provides
│   ├── transformer/        # ts-morph based AST transformer + codegen
│   ├── vite-plugin/        # Vite integration + watch mode
│   └── testing/            # TestContext
```

All packages are published independently so users only install what they need. `core` + `decorators` + `transformer` + `vite-plugin` is the standard install.

---

## Implementation Phases

### Phase 1 — Core data model and decorators
- `InjectionToken`, `BeanDefinition`, `Scope`
- All decorators (metadata attachment only, no transformer yet)
- `ApplicationContext` runtime (accepts pre-built `BeanDefinition[]`)
- `BeanPostProcessor` hook
- Unit tests for the runtime

### Phase 2 — Transformer
- `ts-morph` project setup, file scanning
- Constructor parameter type resolution (non-generic first)
- Dependency graph builder + topological sort
- Circular dependency detection + error reporting
- Code generator (emit `BeanDefinition[]`)
- Integration tests using fixture projects

### Phase 3 — Generic type resolution
- Canonicalise generic types to stable tokens
- Handle type aliases, re-exports, barrel files
- Extend error messages for generic-related failures

### Phase 4 — Vite plugin + watch mode
- Basic Vite plugin wrapping the transformer
- Full rebuild on any change (correct but slow)
- Incremental rebuild tracking

### Phase 5 — Testing utilities
- `TestContext` and `TestContextBuilder`
- Type-safe override API
- Integration with Vitest and Jest

### Phase 6 — Polish
- Source maps for generated files
- Full error message quality pass
- Performance profiling on large projects
- Documentation