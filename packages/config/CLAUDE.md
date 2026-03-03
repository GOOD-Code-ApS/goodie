# @goodie-ts/config

Configuration properties binding for goodie-ts. The `@ConfigurationProperties(prefix)` decorator maps environment variables to class fields at build time.

## Key Files

| File | Role |
|------|------|
| `src/config-transformer-plugin.ts` | `createConfigPlugin()` — scans `@ConfigurationProperties`, extracts fields, populates `valueFields` metadata |
| `src/decorators/configuration-properties.ts` | `@ConfigurationProperties(prefix)` decorator definition |

## How It Works

1. **Compile time:** `createConfigPlugin()` visits classes with `@ConfigurationProperties('prefix')`. For each public field (not `@Value`-decorated, not private/protected), generates a `valueFields` metadata entry with key `prefix.fieldName` and the field initializer as the default value.
2. **Code generation:** The existing codegen handles `valueFields` automatically — creates the `__Goodie_Config` token, adds it as a dependency, and generates factory code that reads config values and assigns them to fields.
3. **Runtime:** Config values come from `process.env` by default, overridable via `createContext(config)` or `TestContext.withConfig()`.

## Relationship to @Value

Both `@Value` (from `@goodie-ts/decorators`) and `@ConfigurationProperties` produce `valueFields` metadata. They're complementary:
- `@Value('KEY')` — individual field injection by exact key
- `@ConfigurationProperties('prefix')` — bulk binding of all public fields under a prefix

Fields decorated with `@Value` are skipped by the config plugin to avoid duplication.

## Gotchas

- Only string literal prefixes are supported (no variables or template literals)
- Requires `@Singleton` or `@Injectable` companion decorator — warns if missing
- All config values are strings from `process.env` — no automatic type coercion yet
- Private/protected fields and `_`-prefixed fields are excluded
