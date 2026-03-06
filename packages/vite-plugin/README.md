# @goodie-ts/vite-plugin

Vite plugin for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) compile-time dependency injection.

## Install

```bash
pnpm add -D @goodie-ts/vite-plugin
```

## Overview

Runs the goodie-ts transformer automatically during Vite builds and re-runs on HMR when `.ts` files change. This is the recommended way to integrate goodie-ts into your project.

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { diPlugin } from '@goodie-ts/vite-plugin';

export default defineConfig({
  plugins: [diPlugin()],
});
```

## Options

```typescript
diPlugin({
  tsConfigPath: 'tsconfig.json',              // default
  outputPath: 'src/AppContext.generated.ts',   // default
  include: ['src/**/*.ts'],                    // source file globs
  debounceMs: 100,                             // HMR rebuild debounce
  configDir: 'config',                         // JSON config file directory
});
```

### `configDir`

When set, the generated code loads JSON config files (`default.json`, `{NODE_ENV}.json`) from this directory at startup. Config values are flattened to dot-separated keys and merged with `process.env`. See `@goodie-ts/core` for `loadConfigFiles()` details.

## Behavior

- **`buildStart`** — full transform, fails the build on errors
- **`handleHotUpdate`** — debounced rebuild on `.ts` changes, logs errors without crashing (better DX in dev)
- The generated output file is excluded from HMR triggers to prevent infinite rebuild loops

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
