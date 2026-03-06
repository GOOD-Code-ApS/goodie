# goodie

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

> **Alpha software.** APIs may change between minor versions until 1.0. Pin your versions and check the [changelog](./.changeset) before upgrading.

Compile-time dependency injection for TypeScript. No `reflect-metadata`, no runtime scanning — just decorators and code generation.

## How It Works

```
Decorators (your code) → Transformer (compile-time) → Generated code → Runtime (ApplicationContext)
```

1. You annotate classes with Stage 3 decorators (`@Singleton`, `@Injectable`, `@Inject`, etc.)
2. At build time, a ts-morph transformer scans your code and generates a typed wiring file
3. At runtime, `ApplicationContext` resolves the dependency graph from the generated definitions

The result: full DI with zero runtime reflection, type-safe tokens, and instant startup.

## Requirements

- **Node.js** >= 22
- **TypeScript** >= 5.7
- **pnpm** >= 10 (for workspace consumers)

## Quick Start

### Install

```bash
pnpm add @goodie-ts/core
pnpm add -D @goodie-ts/transformer @goodie-ts/vite-plugin
```

### Decorate

```typescript
import { Singleton, Inject } from '@goodie-ts/core';

@Singleton()
class UserRepository {
  findAll() { return [{ id: '1', name: 'Alice' }]; }
}

@Singleton()
class UserService {
  @Inject() accessor userRepo!: UserRepository;

  getUsers() { return this.userRepo.findAll(); }
}
```

### Configure Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { diPlugin } from '@goodie-ts/vite-plugin';

export default defineConfig({
  plugins: [diPlugin()],
});
```

### Use

```typescript
import { Goodie } from '@goodie-ts/core';
import { definitions } from './AppContext.generated.js';

const app = await Goodie.build(definitions).start();
const userService = app.context.get(UserService);
```

## Packages

### Core

| Package | Description |
|---------|-------------|
| [`@goodie-ts/core`](./packages/core) | Runtime container, decorators, AOP interceptor chain, `ApplicationContext`, `InjectionToken`, topological sort |
| [`@goodie-ts/transformer`](./packages/transformer) | ts-morph scanner, code generator, and built-in AOP + config plugins (build-time only) |
| [`@goodie-ts/cli`](./packages/cli) | CLI tool — `goodie generate` with watch mode |
| [`@goodie-ts/vite-plugin`](./packages/vite-plugin) | Vite integration — runs transformer on build and HMR |
| [`@goodie-ts/testing`](./packages/testing) | `TestContext` with bean overrides and `@MockDefinition` |

### Framework

| Package | Description |
|---------|-------------|
| [`@goodie-ts/cache`](./packages/cache) | In-memory caching — `@Cacheable`, `@CacheEvict`, `@CachePut` |
| [`@goodie-ts/hono`](./packages/hono) | HTTP routing — `@Controller`, `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`, `ServerConfig`, `EmbeddedServer`, transformer plugin |
| [`@goodie-ts/kysely`](./packages/kysely) | Kysely integration — `KyselyDatabase`, `@Transactional`, `@Migration` |
| [`@goodie-ts/logging`](./packages/logging) | Method logging — `@Log`, `LoggerFactory`, `MDC` |
| [`@goodie-ts/health`](./packages/health) | Health checks — `HealthIndicator`, `HealthAggregator`, `UptimeHealthIndicator` |
| [`@goodie-ts/resilience`](./packages/resilience) | Resilience patterns — `@Retryable`, `@CircuitBreaker`, `@Timeout` |

## Performance

Benchmarks measured on an Apple M-series MacBook. Run `pnpm bench` to reproduce on your machine. Cloud/CI environments will show lower absolute numbers, but relative comparisons hold.

### Build-time (transformer)

| Benchmark | 50 beans | 100 beans | 500 beans |
|---|---|---|---|
| Full pipeline (scan + resolve + graph + codegen) | ~75ms | ~75ms | ~97ms |
| Scanner only | ~71ms | ~76ms | ~94ms |
| Code generation only | ~0.17ms | ~0.35ms | ~1.7ms |

The scanner (ts-morph AST traversal + type resolution) dominates build time. Code generation is negligible. Watch-mode rebuilds skip codegen entirely when the DI graph hasn't changed (IR hash comparison).

### Runtime (ApplicationContext)

| Benchmark | ops/sec |
|---|---|
| `ApplicationContext.create()` — 50 beans | ~222k |
| `ApplicationContext.create()` — 500 beans | ~20k |
| Singleton `get()` (cached) | ~10.5M |
| Prototype `get()` (new instance) | ~143k |
| `getAll()` — 100 beans | ~1M |

Singleton resolution is a single Map lookup — effectively free. The `preSorted` optimization (used by generated code) makes `create()` ~2x faster by skipping redundant topological sorting.

## Development

```bash
pnpm build          # Build all packages
pnpm test           # Run all tests (vitest)
pnpm bench          # Run performance benchmarks
pnpm test:watch     # Watch mode
pnpm lint           # Check with Biome
pnpm lint:fix       # Auto-fix lint issues
pnpm clean          # Clean all dist/
```

## License

[MIT](./LICENSE)
