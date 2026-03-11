# @goodie-ts/validation

Valibot-based validation from compile-time introspection metadata for goodie-ts.

## Key Files

| File | Role |
|------|------|
| `src/vali-schema-factory.ts` | `ValiSchemaFactory` — builds Valibot schemas from `TypeMetadata` in `MetadataRegistry`, caches per type |
| `src/validation-interceptor.ts` | `ValidationInterceptor` — AOP interceptor, reads `paramTypes` from `ctx.metadata`, validates via `ValiSchemaFactory` |
| `src/vali-exception-handler.ts` | `ValiExceptionHandler` — extends `ExceptionHandler` from http, catches `ValiError` -> 400 |
| `src/decorators/constraints.ts` | Constraint decorators: `@MinLength`, `@MaxLength`, `@Min`, `@Max`, `@Pattern`, `@NotBlank`, `@Email`, `@Size` |
| `src/decorators/create-constraint.ts` | `createConstraint()` — define custom constraint decorators with runtime validator |
| `src/decorators/validated.ts` | `@Validated` — AOP decorator via `createAopDecorator`, wires `ValidationInterceptor` |

## How It Works

1. **Build time**: Constraint decorators are no-ops. The introspection plugin scans them as generic `DecoratorMeta { name, args }` on `@Introspected` fields.
2. **Startup**: `ValiSchemaFactory` reads `MetadataRegistry.INSTANCE`, recursively maps `FieldType` tree + constraint metadata to Valibot schemas. Schemas cached per constructor.
3. **Runtime**: `ValidationInterceptor` reads `paramTypes` from AOP metadata, looks up schemas, calls `v.parse()`. For `Request<T>` params, validates `request.body`.
4. **Error boundary**: `ValiExceptionHandler` catches `ValiError` and returns `Response.status(400, { errors })`.

## Schema Building

`ValiSchemaFactory.fieldTypeToVali()` maps the recursive `FieldType` tree:
- `primitive` -> `v.string()`, `v.number()`, `v.boolean()`
- `literal` -> `v.literal(value)`
- `array` -> `v.array(elementSchema)`
- `reference` -> recursive lookup in `MetadataRegistry`. Non-introspected types -> `v.unknown()` (validation skipped, not an error)
- `union` -> `v.union([...])`
- `optional` -> `v.optional(inner)`
- `nullable` -> `v.nullable(inner)`

Constraints applied via `v.pipe(schema, ...actions)`.

## Library Beans (beans.json)

3 singleton beans:
- **ValiSchemaFactory** — schema builder + cache
- **ValidationInterceptor** — AOP interceptor, depends on ValiSchemaFactory
- **ValiExceptionHandler** — extends ExceptionHandler (from http)

## Design Decisions

- **Constraint decorators are thin no-ops** — runtime logic is Valibot's. Metadata extracted at build time by the existing introspection plugin.
- **Schemas built from introspection, not codegen** — `ValiSchemaFactory` reads `MetadataRegistry` at runtime. No Valibot imports in generated code.
- **Non-introspected references are `v.unknown()`** — validation is opt-in. Missing `@Introspected` on a referenced type means that field isn't validated, not an error.
- **`@Validated` at class and method level** — class-level validates all methods. Method-level for fine-grained control.
- **Exception handler lives here, not in the adapter** — follows Micronaut's pattern. The generic exception handling pipeline in `@goodie-ts/http` iterates all `ExceptionHandler` beans. `ValiExceptionHandler` is one of potentially many.
