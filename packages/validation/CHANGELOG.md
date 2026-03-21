# @goodie-ts/validation

## 1.1.0

### Minor Changes

- 49e873c: Wrap external API calls in generated code behind stable abstractions.

  - **`@goodie-ts/hono`**: Add generic `extractPathParam<T>()`, `extractQueryParam<T>()`, `extractQueryParams<T>()`, and `extractBody<T>()` to `router-helpers.ts`. Generated `routes.ts` now calls these typed helpers instead of `c.req.param()`, `c.req.query()`, `c.req.queries()`, `c.req.json()` directly. Hono API changes only require updating the helpers, not regenerating routes.
  - **`@goodie-ts/validation`**: Add `registerSchema()` function and `schemaFromFieldDescriptors()` for declarative schema building from plain field descriptors. Generated `schemas.ts` now emits `registerSchema(ClassName, fields)` with JSON-serialized `FieldType` + `DecoratorMeta` data instead of direct Valibot API calls. Generated code no longer imports Valibot. Reference fields use `v.lazy()` for order-independent composability. Extract shared `constraintToActions()` into `constraint-actions.ts` to deduplicate constraint mapping between pre-built and lazy schema paths.
