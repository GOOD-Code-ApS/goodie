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
              ├→  transformer  →  vite-plugin
core  ───────┘         │
  ↑                    ↓
  └──────────── generated code (imports core)
testing → core
```

## Key Design Decisions

- **Native Stage 3 decorators** — no `experimentalDecorators`, no reflect-metadata
- **`accessor` keyword** for `@Inject`/`@Optional` (Stage 3 has no parameter decorators)
- **Lazy singletons** by default, `@Eager()` opt-in
- **Async factories** supported from day one (`getAsync()`)
- **Typed InjectionTokens** for interfaces, primitives, generics
- **No runtime scanning** — all wiring is code-generated at compile time

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
| `packages/decorators` | @Injectable, @Singleton, @Module, @Provides, @Inject, etc. |
| `packages/transformer` | ts-morph scanner → resolver → graph-builder → codegen |
| `packages/testing` | TestContext with bean overrides and @MockDefinition |
| `packages/vite-plugin` | Vite integration, runs transformer on build/HMR |
| `examples/basic` | End-to-end example with generics, modules, testing |

## Testing

- Vitest with path aliases resolving to source (not dist)
- Tests live in `__tests__/` directories within each package
- Transformer tests use in-memory ts-morph projects (`createTestProject` helper)
- Example tests demonstrate @MockDefinition integration

## Conventions

- Target: ES2022, libs include `ESNext.Decorators` for `Symbol.metadata`
- All packages use `composite: true` for TypeScript project references
- Generated files: `AppContext.generated.ts` — gitignored, never hand-edit
