# @goodie-ts/transformer

Compile-time TypeScript transformer for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) dependency injection.

## Install

```bash
pnpm add -D @goodie-ts/transformer
```

## Overview

Scans your TypeScript source for decorated classes at build time using [ts-morph](https://ts-morph.com), resolves the dependency graph, and generates a typed wiring file (`AppContext.generated.ts`). No runtime reflection needed.

## Pipeline

```
Scanner → Resolver → GraphBuilder → Codegen
```

1. **Scanner** — reads ts-morph AST, discovers `@Singleton`, `@Transient`, `@Module`, `@Provides`
2. **Resolver** — resolves types, constructor params, field injections, and `InjectionToken` references
3. **GraphBuilder** — validates the dependency graph, expands modules, detects cycles
4. **Codegen** — emits typed `ComponentDefinition[]`, factory functions, and token exports

The transformer includes built-in plugins for **AOP** (`@Around`, `@Before`, `@After`) and **config** (`@Config`) that are always active — no manual plugin configuration needed.

## Usage

Most users should use [`@goodie-ts/vite-plugin`](https://www.npmjs.com/package/@goodie-ts/vite-plugin) which calls the transformer automatically. For direct use:

```typescript
import { transform } from '@goodie-ts/transformer';

await transform({
  tsConfigPath: './tsconfig.json',
  outputPath: './src/AppContext.generated.ts',
});
```

## Generated Output

The generated file exports:
- Typed `InjectionToken` declarations for interfaces, generics, and primitives
- A `definitions` array of `ComponentDefinition[]`
- `createContext()` — async factory returning an `ApplicationContext`
- `app` — a `Goodie.build(definitions)` instance ready to `.start()`

## Error Messages

Missing provider errors include fuzzy matching suggestions ("Did you mean: UserService?") and plugin errors are wrapped with the plugin name for context. Set `GOODIE_DEBUG=true` to print the full bean graph, resolution order, and active plugins during build.

## Library Mode

For packages that ship pre-scanned beans, use `transformLibrary()` (via `goodie generate --mode library`). It serializes all bean definitions (including conditional ones) to `beans.json` and also scans for `createAopDecorator<{...}>()` calls, including AOP config in the manifest. Conditional beans are not filtered at build time -- evaluation of `@ConditionalOnProperty`, `@ConditionalOnEnv`, and `@ConditionalOnMissing` happens at runtime in `ApplicationContext.create()`. Consumers auto-discover beans and AOP mappings at build time.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
