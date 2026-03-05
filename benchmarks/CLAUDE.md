# benchmarks/

Performance benchmarks using vitest bench (tinybench under the hood).

## Running

```bash
pnpm bench          # Run all benchmarks
```

## Files

| File | What it measures |
|------|-----------------|
| `helpers.ts` | Shared generators: `generateBeanSource(n)` for transformer benchmarks, `generateBeanDefinitions(n)` for runtime benchmarks |
| `transformer.bench.ts` | Build-time: full pipeline, scanner only, codegen only — for 50/100/500 beans |
| `runtime.bench.ts` | Runtime: `ApplicationContext.create()`, singleton/prototype `get()`, `getAll()` |

## Adding Benchmarks

- Use `.bench.ts` extension (configured in `vitest.config.ts` → `bench.include`)
- Import `bench` and `describe` from `vitest`
- Pre-compute setup data outside `bench()` calls so setup cost isn't measured
- For transformer benchmarks, create the ts-morph `Project` inside `bench()` since project creation is part of the pipeline cost, or use the `setup` option to exclude it

## Future

- NestJS comparison benchmark (`nestjs-comparison.bench.ts`) — compare `ApplicationContext.create()` vs `NestFactory.create()` and `ctx.get()` vs `app.get()`
