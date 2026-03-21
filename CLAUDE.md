# goodie-ts

Build-time validated application framework for TypeScript. No reflection, no runtime scanning — the dependency graph is validated at build time via ts-morph source scanning.

## Architecture

```
Decorators (user code) → Transformer (compile-time) → Generated code → Runtime (ApplicationContext)
```

The transformer uses ts-morph to scan decorated classes at build time, producing a generated file with typed `ComponentDefinition[]` and factory functions. At runtime, `ApplicationContext` resolves the dependency graph — no reflect-metadata needed.

## Package Dependency Graph

```
core  ──────→  transformer  →  vite-plugin / cli
  ↑                 │
  └──────── generated code (imports core)
testing → core
cache / logging / resilience / kysely / hono ──→ core + transformer (plugins)
```

## Key Design Decisions

- **Always favour compile-time code generation over runtime scanning.** If the transformer knows something at build time (controllers, migrations, interceptors, routes), generate the wiring code directly. Never use runtime scanning, marker classes, or collection injection for statically-known information. Reserve runtime mechanisms (`getAll()`, `baseTokens`) for genuinely dynamic cases where the set of components isn't known until runtime. This is the framework's core differentiator — violating it undermines the entire architecture.
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
| `packages/core` | Runtime container, decorators, AOP runtime (interceptor chain, advice wrappers), ComponentDefinition, InjectionToken, topoSort, `OnStart` lifecycle, `@Order()` |
| `packages/transformer` | ts-morph scanner → resolver → graph-builder → codegen, plugin system, built-in AOP + config + introspection plugins. Framework-agnostic — no HTTP knowledge. |
| `packages/cli` | CLI tool — `goodie generate` with watch mode |
| `packages/vite-plugin` | Vite integration, runs transformer on build/HMR |
| `packages/testing` | TestContext with component overrides and @MockDefinition |
| `packages/cache` | In-memory caching — @Cacheable, @CacheEvict, @CachePut |
| `packages/http` | Abstract HTTP — @Controller, @Get/@Post/etc route decorators, Request\<T\>, Response\<T\>, RouteMetadata, ExceptionHandler, AbstractServerBootstrap, scan-phase transformer plugin |
| `packages/hono` | Hono adapter — config-driven CORS, EmbeddedServer, ServerConfig, HonoServerBootstrap (library component), runtime helpers (toHonoResponse, extractPathParam, extractBody, etc.) |
| `packages/validation` | Valibot-based validation — @Validated, @Introspected DTOs, constraint decorators, registerSchema, ValiSchemaFactory, ValidationInterceptor, ValiExceptionHandler, transformer plugin |
| `packages/kysely` | Kysely integration — abstract KyselyDatabase with per-dialect conditional implementations, @Transactional, @Migration |
| `packages/logging` | Method logging — @Log, LoggerFactory, MDC |
| `packages/resilience` | Resilience patterns — @Retryable, @CircuitBreaker, @Timeout |
| `examples/hono` | Full-stack example with Hono, PostgreSQL, Kysely, TestContainers |
| `examples/cloudflare-workers` | Minimal Cloudflare Workers example with D1, Wrangler, Miniflare integration tests |

## Testing

- Vitest with path aliases resolving to source (not dist)
- Tests live in `__tests__/` directories within each package
- Transformer tests use in-memory ts-morph projects (`createTestProject` helper)
- Example tests demonstrate @MockDefinition integration

## Conventions

- Target: ES2022, libs include `ESNext.Decorators` for `Symbol.metadata`
- All packages use `composite: true` for TypeScript project references
- Generated files: `AppContext.generated.ts` — gitignored, never hand-edit

## peerDependency Convention

Library packages (cache, logging, resilience, health, hono, kysely, events, scheduler, testing) declare `@goodie-ts/core` as a `peerDependency` (`>=1.0.0`). Build-time tools (cli, vite-plugin, transformer) keep it as a regular `dependency`.
