---
"@goodie-ts/core": minor
"@goodie-ts/transformer": minor
---

feat(core,transformer): JSON config file support via configDir option

- `loadConfigFiles(dir, env?)` reads `default.json` and `{env}.json`, flattens nested keys to dot-separated strings
- `flattenObject()` utility for nested object → flat string map conversion
- `configDir` option in `TransformOptions` generates code that loads config files at startup
- Priority: file defaults < env file < process.env < explicit config param
