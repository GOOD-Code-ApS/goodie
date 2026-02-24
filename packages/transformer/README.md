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

1. **Scanner** — reads ts-morph AST, discovers `@Singleton`, `@Injectable`, `@Module`, `@Provides`
2. **Resolver** — resolves types, constructor params, field injections, and `InjectionToken` references
3. **GraphBuilder** — validates the dependency graph, expands modules, detects cycles
4. **Codegen** — emits typed `BeanDefinition[]`, factory functions, and token exports

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
- A `definitions` array of `BeanDefinition[]`
- `createContext()` — async factory returning an `ApplicationContext`
- `app` — a `Goodie.build(definitions)` instance ready to `.start()`

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
