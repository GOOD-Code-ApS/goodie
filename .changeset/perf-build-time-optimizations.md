---
"@goodie-ts/transformer": patch
"@goodie-ts/core": patch
---

perf: build-time and runtime performance optimizations

Transformer:
- Merge scan + plugin visitors into a single AST pass (eliminates double traversal)
- Skip .d.ts and node_modules files in scanner
- IR hash to skip codegen when DI graph is unchanged (watch mode optimization)
- Memoize type resolution (getType/getSymbol/getDeclarations cache)
- Single lifecycle method pass (merge @PreDestroy + @PostConstruct scanning)
- Merge codegen collection passes into one iteration
- Merge filesystem discovery (plugins + library manifests in single scan)
- Cache filesystem discovery for watch mode (discoveryCache option)
- Generator-based getAllDependencies (avoids intermediate array allocations)
- Memoize computeRelativeImport in codegen
- Pass pre-computed IR hash to avoid double SHA-256 computation

Core:
- Add preSorted option to ApplicationContext.create() to skip redundant topoSort (generated code is already topologically sorted)
