---
"@goodie-ts/core": minor
"@goodie-ts/transformer": minor
---

Add `@Introspected` decorator and compile-time type metadata generation.

`@Introspected()` marks value objects (DTOs, request/response types) for compile-time field metadata extraction. The built-in introspection transformer plugin scans these classes and generates `MetadataRegistry` registration code with recursive `FieldType` trees and generic `DecoratorMeta` on each field. Introspected classes are NOT beans — they are consumed at runtime by validation, OpenAPI, and serialization systems.

New exports from `@goodie-ts/core`: `Introspected`, `TypeMetadata`, `IntrospectedField`, `FieldType`, `DecoratorMeta`, `MetadataRegistry`.
New export from `@goodie-ts/transformer`: `createIntrospectionPlugin`.
