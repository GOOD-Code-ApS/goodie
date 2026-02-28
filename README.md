# goodie

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

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
pnpm add @goodie-ts/core @goodie-ts/decorators
pnpm add -D @goodie-ts/transformer @goodie-ts/vite-plugin
```

### Decorate

```typescript
import { Singleton, Inject } from '@goodie-ts/decorators';

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

| Package | Description |
|---------|-------------|
| [`@goodie-ts/core`](./packages/core) | Runtime container, `ApplicationContext`, `InjectionToken`, topological sort |
| [`@goodie-ts/decorators`](./packages/decorators) | `@Singleton`, `@Injectable`, `@Inject`, `@Module`, `@Provides`, and more |
| [`@goodie-ts/transformer`](./packages/transformer) | ts-morph scanner and code generator (build-time only) |
| [`@goodie-ts/cli`](./packages/cli) | CLI tool — `goodie generate` with watch mode |
| [`@goodie-ts/vite-plugin`](./packages/vite-plugin) | Vite integration — runs transformer on build and HMR |
| [`@goodie-ts/testing`](./packages/testing) | `TestContext` with bean overrides and `@MockDefinition` |

## Development

```bash
pnpm build          # Build all packages
pnpm test           # Run all tests (vitest)
pnpm test:watch     # Watch mode
pnpm lint           # Check with Biome
pnpm lint:fix       # Auto-fix lint issues
pnpm clean          # Clean all dist/
```

## License

[MIT](./LICENSE)
