# @goodie-ts/config

Configuration properties binding for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) — map environment variables to typed class fields.

## Install

```bash
pnpm add @goodie-ts/config
```

## Overview

The `@ConfigurationProperties` decorator binds environment variables to class fields by prefix. Combined with `@Value` for individual keys, this provides type-safe configuration injection.

## Decorators

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@ConfigurationProperties(prefix)` | class | Binds all public fields under `prefix.fieldName` |
| `@Value(key, { default? })` | accessor field | Injects a single config value by key |

## Usage

```typescript
import { Singleton } from '@goodie-ts/decorators';
import { ConfigurationProperties } from '@goodie-ts/config';

@ConfigurationProperties('database')
@Singleton()
class DatabaseConfig {
  host = 'localhost';
  port = '5432';
  name = 'mydb';
}
// Reads: database.host, database.port, database.name from env/config
// Falls back to field initializers as defaults
```

## Vite Plugin Setup

```typescript
import { diPlugin } from '@goodie-ts/vite-plugin';
import { createConfigPlugin } from '@goodie-ts/config';

export default defineConfig({
  plugins: [diPlugin({ plugins: [createConfigPlugin()] })],
});
```

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
