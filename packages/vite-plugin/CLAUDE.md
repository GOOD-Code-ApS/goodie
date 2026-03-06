# @goodie-ts/vite-plugin

Vite integration that runs the transformer on build and re-runs on HMR.

## Key Files

| File | Role |
|------|------|
| `src/plugin.ts` | `diPlugin(options?)` — Vite plugin factory |
| `src/options.ts` | `DiPluginOptions` (user) and `ResolvedOptions` (internal) |
| `src/rebuild.ts` | `runRebuild()` — wraps `transform()` with error handling |

## Plugin Hooks

| Hook | Behavior |
|------|----------|
| `configResolved` | Resolves relative paths against Vite root |
| `buildStart` | Full transform, throws on error (aborts build) |
| `handleHotUpdate` | Debounced rebuild on `.ts` changes, skips generated output file |

The plugin is `enforce: 'pre'` and named `'goodie'`.

## Config Options

```typescript
interface DiPluginOptions {
  tsConfigPath?: string;   // default: "tsconfig.json"
  outputPath?: string;     // default: "src/AppContext.generated.ts"
  include?: string[];      // source file globs
  debounceMs?: number;     // HMR rebuild debounce, default: 100
  plugins?: TransformerPlugin[];  // additional transformer plugins
  scan?: string[];         // npm scopes to scan for library beans
  configDir?: string;      // directory containing JSON config files (default.json, {env}.json)
}
```

All paths are resolved to absolute in `ResolvedOptions`.

## Gotchas

- The generated output file is excluded from HMR triggers to prevent infinite rebuild loops
- `buildStart` throws on transformer errors (fails the build), but `handleHotUpdate` logs errors without crashing (better DX in dev)
- `runRebuild()` returns a discriminated union `{ success, result | error }` — catches `TransformerError` and generic errors
