# @goodie-ts/management

Management endpoints for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) applications.

## Install

```bash
pnpm add @goodie-ts/management
```

## Overview

Provides runtime introspection endpoints for your application under `/management`. Includes component listing, environment inspection (with sensitive value masking), and application info.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /management/components` | Lists all component definitions with token, scope, dependencies, and conditional rules |
| `GET /management/env` | Shows the resolved configuration with sensitive values masked (`******`) |
| `GET /management/info` | Returns `info.*` config properties as a nested object |

## Usage

Add the package as a dependency — the endpoints are auto-discovered as library components at build time:

```json
// config/default.json
{
  "info": {
    "app.name": "My App",
    "app.version": "1.0.0"
  }
}
```

`GET /management/info` returns:

```json
{
  "app": {
    "name": "My App",
    "version": "1.0.0"
  }
}
```

## Sensitive Value Masking

The `/env` endpoint masks any config key containing these segments (delimited by `.`, `_`, or `-`):

`password`, `credential`, `certificate`, `key`, `secret`, `token`

## Setup

No plugin configuration needed — `@goodie-ts/management` ships pre-scanned components in `components.json`. The transformer auto-discovers them at build time.

## Peer Dependencies

- `@goodie-ts/core` >= 1.0.0
- `@goodie-ts/http` >= 1.0.0

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
