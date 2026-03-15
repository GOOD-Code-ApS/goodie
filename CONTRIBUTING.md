# Contributing to goodie-ts

## Development Setup

```bash
pnpm install
pnpm build
pnpm test
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests (vitest) |
| `pnpm test:watch` | Watch mode |
| `pnpm lint` | Check with Biome |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm clean` | Clean all dist/ |

## Versioning & Releases

### Changesets

We use [Changesets](https://github.com/changesets/changesets) for versioning.

After making changes, create a changeset:

```bash
pnpm changeset
```

Select the affected packages and describe the change. The changeset file is committed alongside the code.

### Release Workflow

```bash
pnpm version      # Apply changesets → update package.json versions
pnpm release      # Build + publish to npm
```

### Dependency Conventions

| Dependency Type | Version Specifier | When to Use |
|----------------|-------------------|-------------|
| `dependencies` | `workspace:^` | Runtime dependency on another package |
| `peerDependencies` | `workspace:^` | Consumer must also install (e.g. transformer for plugins) |
| `devDependencies` | `workspace:*` | Build-time or test-time only |

`workspace:^` publishes as `^0.5.0` (compatible range). `workspace:*` publishes as `*` but is only used in devDependencies, which aren't installed by consumers.

## Adding Library Components to a Package

Library components allow packages to ship pre-scanned component definitions so consumers don't need transformer plugins to wire them.

### 1. Decorate source classes

Add `@Singleton()` (from `@goodie-ts/core`) to classes that should be discoverable:

```typescript
import { Singleton } from '@goodie-ts/core';

@Singleton()
export class MyInterceptor implements MethodInterceptor { ... }
```

### 2. Update package.json

```json
{
  "goodie": {
    "components": "dist/components.json"
  },
  "scripts": {
    "build": "tsc && goodie generate --mode library"
  },
  "dependencies": {
    "@goodie-ts/core": "workspace:^"
  },
  "devDependencies": {
    "@goodie-ts/cli": "workspace:*"
  }
}
```

### 3. Build

```bash
pnpm build
```

This runs `tsc` (JS + `.d.ts`) then `goodie generate --mode library` (components.json).

Consumers automatically discover components via `discoverLibraryComponents()` at build time.

## Adding Declarative AOP to a Package

For packages that provide AOP decorators (e.g. `@Log`, `@Cacheable`, `@Retryable`), use `createAopDecorator<{...}>()` from `@goodie-ts/core`. The full AOP configuration lives in the type parameter — the transformer extracts it at build time via the TypeScript type checker.

### How it works

1. Define your decorator with `createAopDecorator<{...}>()`, encoding the interceptor class, order, metadata, arg mapping, and defaults in the type parameter.
2. Run `goodie generate --mode library` — the AOP scanner reads the type parameter and includes the config in `components.json` under an `aop` section.
3. Consumers install the package — the transformer discovers AOP mappings from `components.json` and wires the generic declarative AOP plugin automatically.

No hand-written transformer plugins, no `goodie.aop` in package.json — the source code is the single source of truth.

### `createAopDecorator` API

```typescript
import { createAopDecorator } from '@goodie-ts/core';
import type { MyInterceptor } from './my-interceptor.js';

export const MyDecorator = createAopDecorator<{
  interceptor: MyInterceptor;    // Interceptor class (instance type)
  order: -50;                    // Chain order (must be a literal number)
  metadata?: { key: 'value' };   // Static metadata merged into every ref
  argMapping?: ['firstArg'];     // Maps positional args to named keys
  defaults?: { firstArg: 'x' };  // Default values when args are missing
  args?: [firstArg: string];     // Call-site argument types (ignored by scanner)
}>();
```

| Field | Required | Description |
|-------|----------|-------------|
| `interceptor` | Yes | Interceptor class (instance type) — scanner resolves the class via its symbol |
| `order` | Yes | Chain order — must be a **literal number** (e.g. `-100`, not `number`). Lower = outermost. Convention: logging `-100`, cache `-50`, timeout `-30`, circuit-breaker `-20`, retry `-10` |
| `metadata` | No | Static metadata merged into every interceptor ref (always wins over parsed args) |
| `argMapping` | No | Maps positional decorator args to named keys (e.g. `@Cacheable('todos')` → `{ cacheName: 'todos' }`) |
| `defaults` | No | Default values when decorator args are missing |
| `args` | No | Call-site argument types — purely for TypeScript inference, **ignored by the scanner** |

### Examples

**Simple — no call-site args:**
```typescript
export const Log = createAopDecorator<{
  interceptor: LoggingInterceptor;
  order: -100;
  args: [opts?: LogOptions];
}>();
// Usage: @Log() or @Log({ level: 'debug' })
```

**With positional args + metadata:**
```typescript
export const Cacheable = createAopDecorator<{
  interceptor: CacheInterceptor;
  order: -50;
  metadata: { cacheAction: 'get' };
  argMapping: ['cacheName'];
  args: [cacheName: string, opts?: { ttlMs?: number }];
}>();
// Usage: @Cacheable('todos') or @Cacheable('todos', { ttlMs: 30000 })
```

**With defaults:**
```typescript
export const Retryable = createAopDecorator<{
  interceptor: RetryInterceptor;
  order: -10;
  defaults: { maxAttempts: 3; delay: 1000; multiplier: 1 };
  args: [opts?: RetryOptions];
}>();
// Usage: @Retryable() or @Retryable({ maxAttempts: 5 })
```

See `packages/logging`, `packages/cache`, and `packages/resilience` for real-world examples.

### Argument parsing at consumer sites

The generic AOP plugin parses decorator arguments at consumer build time:

- **No args** → `{}` (merged with defaults + metadata)
- **Object literal** `@Retryable({ maxAttempts: 5 })` → parsed key-value pairs
- **Positional args** `@Cacheable('todos')` → mapped via `argMapping`
- **Positional + object** `@Cacheable('todos', { ttlMs: 30000 })` → both merged

Merge order: `defaults` ← parsed args ← `metadata` (static always wins).

### Custom transformer plugins

For non-AOP concerns (config binding, migration wiring, etc.), implement a `TransformerPlugin` and register it via `goodie.plugin` in `package.json`:

```json
{
  "goodie": {
    "plugin": "./dist/my-transformer-plugin.js"
  }
}
```

The plugin module must have a **default export** that is a no-arg factory function returning a `TransformerPlugin`. Plugins are auto-discovered from packages in the scanned scopes (default: `@goodie-ts`) — consumers don't need to list them manually.

See `packages/kysely` for an example.
