# @goodie-ts/validation

Valibot-based validation from compile-time introspection metadata for goodie-ts.

## Key Files

| File | Role |
|------|------|
| `src/plugin.ts` | Transformer plugin — scans `@Validated` methods for `Request<T>` param types, generates `MetadataRegistry.registerMethodParams()` calls |
| `src/vali-schema-factory.ts` | `ValiSchemaFactory` — builds Valibot schemas from `TypeMetadata` in `MetadataRegistry`, caches per type |
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

- **`visitMethod`** — detects `@Validated` decorator, extracts `Request<T>` type argument via ts-morph, stores body type class name + import path
- **`codegen`** — emits imports and `MetadataRegistry.INSTANCE.registerMethodParams(ControllerClass, 'methodName', [BodyTypeClass])` calls

This bridges the compile-time type information to runtime, enabling the `ValidationInterceptor` to know which types to validate without reflection.

## Schema Building

`ValiSchemaFactory.fieldTypeToVali()` maps the recursive `FieldType` tree:
- `primitive` -> `v.string()`, `v.number()`, `v.boolean()`
- `literal` -> `v.literal(value)`
- `array` -> `v.array(elementSchema)`
- `reference` -> recursive lookup in `MetadataRegistry`. Non-introspected types -> `v.unknown()` (validation skipped, not an error)
- `union` -> `v.union([...])`
- `optional` -> `v.optional(inner)`
- `nullable` -> `v.nullable(inner)`

Constraints applied via `v.pipe(schema, ...actions)`. The `Size` constraint maps to `v.minLength()` + `v.maxLength()`.

## Library Components (components.json)

3 singleton components:
- **ValiSchemaFactory** — schema builder + cache
- **ValidationInterceptor** — AOP interceptor, depends on ValiSchemaFactory
- **ValiExceptionHandler** — extends ExceptionHandler (from http), `baseTokens: [ExceptionHandler]`

## Design Decisions

- **Constraint decorators are thin no-ops** — runtime logic is Valibot's. Metadata extracted at build time by the existing introspection plugin.
- **Schemas built from introspection, not codegen** — `ValiSchemaFactory` reads `MetadataRegistry` at runtime. No Valibot imports in generated code.
- **Non-introspected references are `v.unknown()`** — validation is opt-in. Missing `@Introspected` on a referenced type means that field isn't validated, not an error.
- **`@Validated` at method level** — applied to individual controller methods that need validation. The AOP wiring connects `ValidationInterceptor`.
- **Param types via MetadataRegistry** — the validation plugin generates `registerMethodParams()` calls at build time. The interceptor reads them at runtime via `getMethodParams()`. This avoids JSON-serialization limitations of the AOP metadata path (class references aren't JSON-serializable).
- **Exception handler lives here, not in the adapter** — follows Micronaut's pattern. The generic exception handling pipeline in `@goodie-ts/http` iterates all `ExceptionHandler` components. `ValiExceptionHandler` is one of potentially many.
