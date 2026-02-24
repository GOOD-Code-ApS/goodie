# @goodie-ts/transformer

Compile-time scanning, type resolution, and code generation. Turns decorated TypeScript source into a generated `BeanDefinition[]` file.

## Pipeline

```
Scanner → Resolver → GraphBuilder → Codegen
```

| Stage | File | Input → Output |
|-------|------|----------------|
| Scanner | `src/scanner.ts` | ts-morph `Project` → `ScanResult` (AST-level beans, modules) |
| Resolver | `src/resolver.ts` | `ScanResult` → `ResolveResult` (typed IR with TokenRefs) |
| GraphBuilder | `src/graph-builder.ts` | `ResolveResult` → `GraphResult` (validated, topo-sorted) |
| Codegen | `src/codegen.ts` | `IRBeanDefinition[]` → generated TypeScript string |

Entry points: `transform(options)` for file-based, `transformInMemory(project, outputPath)` for tests.

## Key Files

| File | Role |
|------|------|
| `src/ir.ts` | IR types: `IRBeanDefinition`, `TokenRef`, `IRDependency`, `IRModule`, etc. |
| `src/transform.ts` | `transform()` and `transformInMemory()` orchestrators |
| `src/transformer-errors.ts` | `TransformerError` subclasses with source locations |

## IR Types (ir.ts)

- **`TokenRef`** — union: `ClassTokenRef { kind: 'class', className, importPath }` or `InjectionTokenRef { kind: 'injection-token', tokenName, importPath?, typeAnnotation?, typeImports? }`
- **`IRBeanDefinition`** — full bean: token, scope, eager, name, constructorDeps, fieldDeps, factoryKind, providesSource, metadata, sourceLocation
- **`IRDependency`** / **`IRFieldInjection`** — dependency descriptors
- **`IRProvides`** / **`IRModule`** — module factory methods

## Codegen Conventions

- **Token variable names**: Pascal_Snake_Case + `_Token` suffix
  - `Repository<User>` → `Repository_User_Token`
  - `appName` → `App_Name_Token`
  - `dbUrl` → `Db_Url_Token`
- **Imports**: type-only imports (`import type`) for types used only in generics
- **Factory patterns**: constructor → `new Cls(dep0, dep1)`, provides → `(dep0 as Module).method(dep1)`
- **Field injection**: factory body creates instance, assigns fields, returns instance
- **Module metadata**: `{ isModule: true }` on module bean definitions

## Graph Builder Details

- Expands modules: registers module class + each `@Provides` as separate bean
- Module instances are implicit singletons
- `@Provides` methods get the module instance as their first dependency
- Resolves `@Named()` qualifiers to match `@Inject('name')`
- Validates required providers exist, detects cycles

## Testing

Tests use `createTestProject` helper for in-memory ts-morph projects — no real filesystem needed.

## Error Types

All extend `TransformerError` with `sourceLocation` and optional `hint`:
`MissingProviderError`, `AmbiguousProviderError`, `UnresolvableTypeError`, `InvalidDecoratorUsageError`, `GenericTypeResolutionError`, `CircularDependencyError`
