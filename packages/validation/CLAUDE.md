# @goodie-ts/validation

Valibot-based validation from compile-time introspection metadata for goodie-ts.

## Key Files

| File | Role |
|------|------|
| `src/plugin.ts` | Transformer plugin — `visitMethod` stores `validatedMethodParams` metadata for core codegen, `emitFiles` generates `schemas.ts` with `registerSchema()` calls using plain field descriptors (no Valibot in generated code) |
| `src/schema-builder.ts` | `registerSchema()` — accepts class constructor + field descriptors, builds Valibot schemas via `schemaFromFieldDescriptors()`, registers in `ValiSchemaFactory` |
| `src/schema-from-descriptors.ts` | `schemaFromFieldDescriptors()` — maps `FieldType` trees + `DecoratorMeta` constraints to Valibot schemas. Reference fields resolved via direct lookup (codegen ensures topological order) |
| `src/constraint-actions.ts` | `constraintToActions()` — shared mapping from `DecoratorMeta` to Valibot validation actions. Used by both `schema-from-descriptors.ts` and `ValiSchemaFactory` |
| `src/vali-schema-factory.ts` | `ValiSchemaFactory` — builds Valibot schemas from `TypeMetadata` in `MetadataRegistry`, caches per type. Also has static `registerSchema()` / `getPrebuiltByName()` for pre-built schemas |
| `src/vali-body-validator.ts` | `ValiBodyValidator extends BodyValidator` — `@Singleton`, validates request bodies via `ValiSchemaFactory`. Non-`@Introspected` types pass through |
| `src/validation-interceptor.ts` | `ValidationInterceptor` — AOP interceptor, reads param types from `MetadataRegistry`, validates via `ValiSchemaFactory` |
| `src/vali-exception-handler.ts` | `ValiExceptionHandler` — extends `ExceptionHandler` from http, catches `ValiError` -> 400 |
| `src/decorators/constraints.ts` | Constraint decorators: `@MinLength`, `@MaxLength`, `@Min`, `@Max`, `@Pattern`, `@NotBlank`, `@Email`, `@Size` |
| `src/decorators/create-constraint.ts` | `createConstraint()` — define custom constraint decorators with runtime validator |
| `src/decorators/validated.ts` | `@Validated` — AOP decorator via `createAopDecorator`, wires `ValidationInterceptor` |

## How It Works

1. **Build time**: Constraint decorators are no-ops. The introspection plugin scans them as generic `DecoratorMeta { name, args }` on `@Introspected` fields. The validation transformer plugin scans `@Validated` methods, extracts `Request<T>` param types, and generates `MetadataRegistry.registerMethodParams()` calls.
2. **Startup**: `ValiSchemaFactory` reads `MetadataRegistry.INSTANCE`, recursively maps `FieldType` tree + constraint metadata to Valibot schemas. Schemas cached per constructor.
3. **Runtime**: `ValidationInterceptor` reads param types from `MetadataRegistry.getMethodParams()`, looks up schemas, calls `v.parse()`. For `Request<T>` params, validates `request.body`.
4. **Error boundary**: `ValiExceptionHandler` catches `ValiError` and returns `Response.status(400, { errors })`.

## Transformer Plugin (`src/plugin.ts`)

Auto-discovered via `"goodie": { "plugin": "dist/plugin.js" }` in package.json.

- **`visitMethod`** — detects `@Validated` decorator, extracts param types via ts-morph, stores them as `validatedMethodParams` on `ctx.classMetadata` for core codegen to emit `MetadataRegistry.registerMethodParams()` calls
- **`emitFiles`** — generates a `schemas.ts` file with `registerSchema(ClassName, fields)` calls. Field descriptors are JSON-serialized `FieldType` trees + `DecoratorMeta` constraints — generated code never imports Valibot. Registrations are topologically sorted so referenced types are emitted before referencing types. `registerSchema()` builds Valibot schemas at module load time via `schemaFromFieldDescriptors()`

This bridges compile-time type information to runtime, enabling the `ValidationInterceptor` to know which types to validate without reflection.

## Schema Building

Two paths build Valibot schemas from the same `FieldType` tree:

1. **Compile-time (pre-built)**: `registerSchema()` → `schemaFromFieldDescriptors()` — called from generated `schemas.ts` at module load time. Registrations are topologically sorted by the codegen so referenced types are always registered first. Reference fields resolve via direct `ValiSchemaFactory.getPrebuiltByName()` lookup.
2. **Runtime (lazy)**: `ValiSchemaFactory.buildAndCache()` → `fieldTypeToVali()` — fallback for types without pre-built schemas. Reference fields resolve via `MetadataRegistry` lookup.

Both use the shared `constraintToActions()` from `constraint-actions.ts` to map decorators to Valibot actions.

`fieldTypeToVali()` maps the recursive `FieldType` tree:
- `primitive` -> `v.string()`, `v.number()`, `v.boolean()`
- `literal` -> `v.literal(value)`
- `array` -> `v.array(elementSchema)`
- `reference` -> direct lookup via `getPrebuiltByName()` (pre-built path, topologically ordered) or `MetadataRegistry` (runtime path). Non-introspected types -> `v.unknown()` (validation skipped, not an error)
- `union` -> `v.union([...])`
- `optional` -> `v.optional(inner)`
- `nullable` -> `v.nullable(inner)`

Constraints applied via `v.pipe(schema, ...actions)`. The `Size` constraint maps to `v.minLength()` + `v.maxLength()`.

## Library Components (components.json)

4 singleton components:
- **ValiSchemaFactory** — schema builder + cache, with static `registerSchema()` for pre-built schemas
- **ValiBodyValidator** — `extends BodyValidator` (from http), validates request bodies via `ValiSchemaFactory`
- **ValidationInterceptor** — AOP interceptor, depends on ValiSchemaFactory
- **ValiExceptionHandler** — extends ExceptionHandler (from http), `baseTokens: [ExceptionHandler]`

## Design Decisions

- **Constraint decorators are thin no-ops** — runtime logic is Valibot's. Metadata extracted at build time by the existing introspection plugin.
- **Two schema paths** — `emitFiles` generates `registerSchema()` calls with plain field descriptors (no Valibot in generated code). Fallback: `ValiSchemaFactory` reads `MetadataRegistry` lazily at runtime for types without pre-built schemas.
- **Generated code is Valibot-agnostic** — `schemas.ts` imports only `registerSchema` from `@goodie-ts/validation`. All Valibot API calls are encapsulated in `schema-from-descriptors.ts` and `constraint-actions.ts`.
- **Non-introspected references are `v.unknown()`** — validation is opt-in. Missing `@Introspected` on a referenced type means that field isn't validated, not an error.
- **`@Validated` at method level** — applied to individual controller methods that need validation. The AOP wiring connects `ValidationInterceptor`.
- **Param types via MetadataRegistry** — the validation plugin generates `registerMethodParams()` calls at build time. The interceptor reads them at runtime via `getMethodParams()`. This avoids JSON-serialization limitations of the AOP metadata path (class references aren't JSON-serializable).
- **Exception handler lives here, not in the adapter** — the generic exception handling pipeline in `@goodie-ts/http` iterates all `ExceptionHandler` components. `ValiExceptionHandler` is one of potentially many.
