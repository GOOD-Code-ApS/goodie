# goodie

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Build-time validated application framework for TypeScript — no reflection, no runtime scanning, errors before your app starts.

The dependency graph is validated at build time by scanning your source with [ts-morph](https://github.com/dsherret/ts-morph). Missing dependencies, circular references, and typos are caught before the app runs — not at startup. No `reflect-metadata`, no `emitDecoratorMetadata`, no classpath scanning.

HTTP routing, database integration, validation, caching, resilience patterns, and more — all following the same build-time-first philosophy.

## Why goodie?

| Framework | How deps are discovered | When wiring is validated | Reflection? |
|-----------|------------------------|------------------------|-------------|
| NestJS | `reflect-metadata` at runtime | App startup | Yes |
| tsyringe | `reflect-metadata` at runtime | App startup | Yes |
| inversify | `reflect-metadata` at runtime | App startup | Yes |
| Awilix | Manual registration | App startup | No |
| **goodie** | **ts-morph source scanning** | **Build time** | **No** |

goodie is the only TypeScript DI framework that validates the dependency graph before your app runs **and** requires no runtime reflection. Missing beans, circular dependencies, and misspelled tokens are build errors with suggestions — not runtime crashes.

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
| [`@goodie-ts/transformer`](./packages/transformer) | ts-morph scanner, code generator, and built-in AOP + config + introspection plugins (build-time only) |
| [`@goodie-ts/cli`](./packages/cli) | CLI tool — `goodie generate` with watch mode |
| [`@goodie-ts/vite-plugin`](./packages/vite-plugin) | Vite integration — runs transformer on build and HMR |
| [`@goodie-ts/testing`](./packages/testing) | `TestContext` with bean overrides and `@MockDefinition` |

### Framework

| Package | Description |
|---------|-------------|
| [`@goodie-ts/http`](./packages/http) | Abstract HTTP — `@Controller`, `@Get`/`@Post`/etc route decorators, `Request<T>`, `Response<T>`, `ExceptionHandler` |
| [`@goodie-ts/hono`](./packages/hono) | Hono adapter — `EmbeddedServer`, `ServerConfig`, config-driven CORS, codegen plugin |
| [`@goodie-ts/validation`](./packages/validation) | Valibot-based validation — `@Validated`, constraint decorators (`@NotBlank`, `@MaxLength`, etc.), `ValiSchemaFactory`, transformer plugin |
| [`@goodie-ts/kysely`](./packages/kysely) | Kysely integration — `KyselyDatabase`, `@Transactional`, `@Migration` |
| [`@goodie-ts/cache`](./packages/cache) | In-memory caching — `@Cacheable`, `@CacheEvict`, `@CachePut` |
| [`@goodie-ts/logging`](./packages/logging) | Method logging — `@Log`, `LoggerFactory`, `MDC` |
| [`@goodie-ts/health`](./packages/health) | Health checks — `HealthIndicator`, `HealthAggregator`, `UptimeHealthIndicator` |
| [`@goodie-ts/resilience`](./packages/resilience) | Resilience patterns — `@Retryable`, `@CircuitBreaker`, `@Timeout` |

## Performance

Benchmarks measured on an Apple M-series MacBook (March 2026). Run `pnpm bench` to reproduce on your machine. Cloud/CI environments will show lower absolute numbers, but relative comparisons hold.

### Build-time (transformer)

| Benchmark | 50 beans | 100 beans | 500 beans |
|---|---|---|---|
| Full pipeline (scan + resolve + graph + codegen) | ~82ms | ~87ms | ~104ms |
| Scanner only | ~80ms | ~72ms | ~99ms |
| Code generation only | ~0.20ms | ~0.38ms | ~1.9ms |

The scanner (ts-morph AST traversal + type resolution) dominates build time. Code generation is negligible. Watch-mode rebuilds skip codegen entirely when the DI graph hasn't changed (IR hash comparison).

### Runtime (ApplicationContext)

| Benchmark | ops/sec |
|---|---|
| `ApplicationContext.create()` — 50 beans | ~203k |
| `ApplicationContext.create()` — 500 beans | ~19k |
| Singleton `get()` (cached) | ~10.4M |
| Prototype `get()` (new instance) | ~144k |
| `getAll()` — 100 beans | ~1.1M |

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
