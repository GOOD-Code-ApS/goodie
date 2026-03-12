# @goodie-ts/transformer

Compile-time scanning, type resolution, and code generation. Turns decorated TypeScript source into a generated `BeanDefinition[]` file.

## Pipeline

```
Scanner → Resolver → GraphBuilder → Codegen
```

| Stage | File | Input → Output |
|-------|------|----------------|
| Scanner | `src/scanner.ts` | ts-morph `Project` → `ScanResult` (AST-level beans) |
| Resolver | `src/resolver.ts` | `ScanResult` → `ResolveResult` (typed IR with TokenRefs) |
| GraphBuilder | `src/graph-builder.ts` | `ResolveResult` → `GraphResult` (validated, topo-sorted) |
| Codegen | `src/codegen.ts` | `IRBeanDefinition[]` → generated TypeScript string |

Entry points: `transform(options)` for file-based, `transformInMemory(project, outputPath, options?)` for tests.

## Config Inlining

When `configDir` is set, the transformer reads JSON config files at build time and inlines flattened values into the generated `ConfigSource` factory. This removes the runtime dependency on `node:fs` / `loadConfigFiles()`. Values are embedded as `{ 'key.path': 'value' }` with `process.env` overrides applied at runtime. The inlined config is also passed to plugins via `CodegenContext`.

`scan()` accepts an optional `plugins` parameter — plugin `visitClass`/`visitMethod` hooks run inline during the scan loop (single AST pass). Returns `pluginMetadata` in `ScanResult`.

## Key Files

| File | Role |
|------|------|
| `src/ir.ts` | IR types: `IRBeanDefinition`, `TokenRef`, `IRDependency`, `IRProvides`, etc. |
| `src/transform.ts` | `transform()`, `transformInMemory()`, and `transformLibrary()` orchestrators |
| `src/aop-scanner.ts` | `scanAopDecoratorDefinitions()` — scans `createAopDecorator<{...}>()` calls, extracts config from type parameters via type checker |
| `src/aop-plugin.ts` | `createDeclarativeAopPlugin()` — generic AOP plugin driven by `AopDecoratorDeclaration` mappings |
| `src/builtin-aop-plugin.ts` | `createAopPlugin()` — built-in plugin scanning `@Around/@Before/@After` decorators |
| `src/builtin-config-plugin.ts` | `createConfigPlugin()` — built-in plugin reading introspection metadata for `@ConfigurationProperties` |
| `src/builtin-introspection-plugin.ts` | `createIntrospectionPlugin()` — built-in plugin scanning `@Introspected`, extracting field types and decorator metadata |
| `src/library-beans.ts` | `serializeBeans()`, `deserializeBeans()`, `discoverLibraryBeans()`, `discoverAopMappings()` |
| `src/discover-plugins.ts` | `discoverAll()` — single-pass plugin + library manifest discovery from `node_modules` |
| `src/transformer-errors.ts` | `TransformerError` subclasses with source locations |

## IR Types (ir.ts)

- **`TokenRef`** — union: `ClassTokenRef { kind: 'class', className, importPath }` or `InjectionTokenRef { kind: 'injection-token', tokenName, importPath?, typeAnnotation?, typeImports? }`
- **`IRDecoratorEntry`** — `{ name: string, importPath: string }` — a decorator recorded on a class or method
- **`IRBeanDefinition`** — full bean: token, scope, eager, name, constructorDeps, fieldDeps, factoryKind, providesSource, decorators, methodDecorators, metadata, sourceLocation
- **`IRDependency`** / **`IRFieldInjection`** — dependency descriptors
- **`IRProvides`** — module factory method descriptor (used during resolver expansion)

## Plugin Bean Registration

Plugins can register classes as beans via `ctx.registerBean({ scope })` in their `visitClass` hook. This allows external packages to define bean-producing decorators (e.g. `@Controller`) without the scanner hardcoding knowledge of them. The scanner has **zero knowledge of HTTP, controllers, or any plugin-specific decorators**.

## Codegen Conventions

- **Token variable names**: Pascal_Snake_Case + `_Token` suffix
  - `Repository<User>` → `Repository_User_Token`
  - `appName` → `App_Name_Token`
  - `dbUrl` → `Db_Url_Token`
- **Imports**: type-only imports (`import type`) for types used only in generics
- **Factory patterns**: constructor → `new Cls(dep0, dep1)`, provides → `(dep0 as Module).method(dep1)`
- **Field injection**: factory body creates instance, assigns fields, returns instance
- **Module metadata**: `{ isModule: true }` on module bean definitions

## Plugin System

External packages can extend the transformer via the `TransformerPlugin` interface:
- `beforeScan` — called before scanning starts
- `visitClass` / `visitMethod` — scan hooks called during the single AST pass
- `afterResolve(beans)` — post-resolution hook, can filter/mutate IR beans
- `beforeCodegen(beans)` — pre-codegen hook, can inject synthetic beans

Plugins are auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json. Built-in plugins (AOP, introspection, config, conditional) are always active — introspection runs before config since `@ConfigurationProperties` implies `@Introspected`.

## Introspection Plugin

The built-in introspection plugin scans `@Introspected()` and `@ConfigurationProperties()` classes and generates `MetadataRegistry` registration code. Key points:

- **NOT beans** — `@Introspected` classes are value objects (DTOs, request/response types). The plugin does NOT call `ctx.registerBean()`.
- **`@ConfigurationProperties` implies `@Introspected`** — config classes are automatically introspected. The config plugin reads field metadata from `ctx.metadata.introspectedFields` rather than doing its own AST scanning.
- **Inter-plugin metadata sharing** — stores scanned fields in `ctx.metadata.introspectedFields` so downstream plugins (e.g. config) can consume the data without duplicating scanning logic.
- **Field type resolution** — builds a recursive `FieldType` tree: primitive, literal, array, reference, union, optional, nullable. Handles `boolean` correctly (ts-morph represents it as `false | true` union).
- **Generic decorator metadata** — records ALL field decorators as `DecoratorMeta { name, args }`. The plugin doesn't interpret decorators — downstream consumers (validation, OpenAPI) do.
- **Codegen** — emits `MetadataRegistry` import, class imports, and `__metadataRegistry.register(...)` calls with serialized field metadata.
- **`strictNullChecks` requirement** — without it, `string | null` collapses to `string`. The framework's `tsconfig.base.json` sets `strict: true` which implies `strictNullChecks`. A build-time validation check is planned for v2.0.0.

## Graph Builder Details

- Validates required providers exist, detects cycles
- Resolves `@Named()` qualifiers to match `@Inject('name')`
- Topological sort for dependency ordering
- Note: `@Provides` expansion now happens in the resolver stage, not the graph builder
- Conditional beans (`@ConditionalOnProperty`, `@ConditionalOnEnv`, `@ConditionalOnMissingBean`) pass through unfiltered — the conditional plugin records rules in `metadata.conditionalRules`, but evaluation happens at runtime in `ApplicationContext.create()`

## Library Import Path Reconciliation

Library beans use bare package specifiers (`@goodie-ts/kysely`) in their tokenRefs (set by `rewriteImportPaths` during `transformLibrary`). When user code imports a library class, ts-morph resolves the dependency to the declaration's absolute file path. `reconcileLibraryImportPaths()` in `transform.ts` bridges this mismatch:

1. **Bean lookup** — className → library bean tokenRef map. Rewrites deps when className matches a known library bean.
2. **`packageDirs` fallback** — for non-bean library classes (e.g. abstract base classes used in `baseTokenRefs`), checks if the absolute import path falls under a known library package directory (resolved via `fs.realpathSync` during `discoverAll()`). `DiscoverAllResult.packageDirs` maps real directory paths → bare package names.

## Library Mode (`transformLibrary`)

`transformLibrary()` scans library source, runs the full pipeline, then serializes all beans (including conditional ones) to `beans.json`. Conditional filtering is deferred to the consumer's `ApplicationContext` at runtime. It also:
1. Runs `scanAopDecoratorDefinitions()` to find `createAopDecorator<{...}>()` calls
2. Extracts AOP config from type parameters (interceptor class, order, metadata, argMapping, defaults)
3. Includes the config in the manifest's `aop` section

Consumers discover AOP mappings via `discoverAopMappings()`, which reads beans.json manifests (not package.json).

## Performance Optimizations

- **IR hash**: Codegen output includes a SHA-256 hash of all inputs. `transform()` skips file write when the hash matches the existing file (`TransformResult.skipped`). Prevents unnecessary Vite HMR reloads.
- **Discovery cache**: `TransformOptions.discoveryCache` lets watch-mode callers skip `node_modules` filesystem scanning between rebuilds. Returned in `TransformResult.discoveryCache`.
- **Type resolution memoization**: Scanner caches `getType()→getSymbol()→getDeclarations()` results and `extractTypeArguments()` results per `scan()` call via `TypeResolutionCache`.
- **Single-pass collection**: `collectAllImports()` in codegen iterates beans once for class imports, injection tokens, type-only imports, and interceptor deps.
- **`.d.ts`/`node_modules` skip**: Scanner filters out declaration files and node_modules source files early.

## Testing

Tests use `createTestProject` helper for in-memory ts-morph projects — no real filesystem needed. The `createTestProject` helper accepts an optional `plugins` parameter for testing external plugin codegen.

## Error Types

All extend `TransformerError` with `sourceLocation` and optional `hint`:
`MissingProviderError`, `AmbiguousProviderError`, `UnresolvableTypeError`, `InvalidDecoratorUsageError`, `GenericTypeResolutionError`, `CircularDependencyError`

- **Fuzzy suggestions**: `MissingProviderError` suggests similar registered token names via `findSimilarTokens()` (Levenshtein distance, threshold `max(3, ceil(name.length / 2))`)
- **Plugin error wrapping**: All plugin hook invocations (`beforeScan`, `afterResolve`, `beforeCodegen`) are wrapped with plugin name context ("Error in plugin 'kysely' during afterResolve: ...") and preserve the original error via `{ cause }`. `TransformerError` subclasses pass through unwrapped.
- **`GOODIE_DEBUG`**: When `GOODIE_DEBUG=true`, `transform()` prints the full bean graph, resolution order, and active plugins to stderr

NOTE: `findSimilarTokens`/`levenshtein` in `transformer-errors.ts` are duplicated from `packages/core/src/application-context.ts` (separate packages, no shared util). Keep threshold logic in sync.
