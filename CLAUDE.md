# goodie-ts

Compile-time dependency injection framework for TypeScript.

## Architecture

```
Decorators (user code) → Transformer (compile-time) → Generated code → Runtime (ApplicationContext)
```

The transformer uses ts-morph to scan decorated classes at build time, producing a generated file with typed `BeanDefinition[]` and factory functions. At runtime, `ApplicationContext` resolves the dependency graph — no reflect-metadata needed.

## Package Dependency Graph

```
decorators  ─┐
              ├→  transformer  →  vite-plugin / cli
core  ───────┘         │
  ↑                    ↓
  └──────────── generated code (imports core + aop)
testing → core
aop ──→ transformer (plugin)
cache / logging / resilience / config / kysely / hono ──→ aop + transformer (plugins)
```

## Key Design Decisions

- **Always favour compile-time code generation over runtime scanning.** If the transformer knows something at build time (controllers, migrations, interceptors, routes), generate the wiring code directly. Never use runtime scanning, marker classes, or collection injection for statically-known information. Reserve runtime mechanisms (`getAll()`, `baseTokens`) for genuinely dynamic cases where the set of beans isn't known until runtime. This is the framework's core differentiator — violating it undermines the entire architecture.
- **Native Stage 3 decorators** — no `experimentalDecorators`, no reflect-metadata
- **`accessor` keyword** for `@Inject`/`@Optional` (Stage 3 has no parameter decorators)
- **Lazy singletons** by default, `@Eager()` opt-in
- **Async factories** supported from day one (`getAsync()`)
- **Typed InjectionTokens** for interfaces, primitives, generics

## Commands

```bash
pnpm build          # Build all packages
pnpm test           # Run all tests (vitest)
pnpm test:watch     # Watch mode
pnpm lint           # Check with Biome
pnpm lint:fix       # Auto-fix lint issues
pnpm clean          # Clean all dist/
```

## Packages

| Package | Purpose |
|---------|---------|
| `packages/core` | Runtime container, BeanDefinition, InjectionToken, topoSort |
| `packages/decorators` | @Injectable, @Singleton, @Module, @Provides, @Inject, @Value, lifecycle hooks |
| `packages/transformer` | ts-morph scanner → resolver → graph-builder → codegen, plugin system |
| `packages/cli` | CLI tool — `goodie generate` with watch mode |
| `packages/vite-plugin` | Vite integration, runs transformer on build/HMR |
| `packages/testing` | TestContext with bean overrides and @MockDefinition |
| `packages/aop` | AOP foundation — @Before, @Around, @After, interceptor chain, `createAopDecorator()` |
| `packages/cache` | In-memory caching — @Cacheable, @CacheEvict, @CachePut |
| `packages/config` | Configuration binding — @ConfigurationProperties |
| `packages/hono` | HTTP routing — @Controller, @Get, @Post, etc. |
| `packages/kysely` | Kysely integration — @Transactional, @Migration, CrudRepository |
| `packages/logging` | Method logging — @Log, LoggerFactory, MDC |
| `packages/resilience` | Resilience patterns — @Retryable, @CircuitBreaker, @Timeout |
| `examples/basic` | End-to-end example with generics, modules, testing |
| `examples/hono` | Full-stack example with Hono, PostgreSQL, Kysely, TestContainers |

## Testing

- Vitest with path aliases resolving to source (not dist)
- Tests live in `__tests__/` directories within each package
- Transformer tests use in-memory ts-morph projects (`createTestProject` helper)
- Example tests demonstrate @MockDefinition integration

## Conventions

- Target: ES2022, libs include `ESNext.Decorators` for `Symbol.metadata`
- All packages use `composite: true` for TypeScript project references
- Generated files: `AppContext.generated.ts` — gitignored, never hand-edit

## TODO: peerDependency migration at 1.0.0

Library packages (decorators, aop, cache, logging, resilience, health, hono, kysely, events, scheduler, testing) currently declare `@goodie-ts/core` and other `@goodie-ts/*` runtime deps as regular `dependencies`. They should be `peerDependencies` to prevent duplicate copies causing class identity mismatches at runtime. This migration is blocked while packages are at `0.x` because Changesets + `onlyUpdatePeerDependentsWhenOutOfRange` treats every minor bump as out-of-range in `0.x` semver (`^0.5.0` does not include `0.6.0`), forcing all peer dependents to `1.0.0`. When ready to release `1.0.0`, move `@goodie-ts/*` runtime deps to `peerDependencies` across all library packages. Build-time tools (cli, vite-plugin, transformer) should keep regular dependencies.
