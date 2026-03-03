# @goodie-ts/health

Health check indicators and aggregation for goodie-ts. Provides `HealthIndicator` base class, `HealthAggregator`, and a built-in `UptimeHealthIndicator`.

## Key Files

| File | Role |
|------|------|
| `src/health-indicator.ts` | `HealthIndicator` — abstract base class with `name` and `check()` |
| `src/health-aggregator.ts` | `HealthAggregator` — collects all indicators via constructor injection, reports combined status |
| `src/uptime-health-indicator.ts` | `UptimeHealthIndicator` — built-in indicator reporting app uptime |
| `src/health-transformer-plugin.ts` | `createHealthPlugin()` — detects `HealthIndicator` subclasses, synthesizes beans |

## How It Works

1. **User defines indicators** by extending `HealthIndicator` and decorating with `@Singleton()`
2. **Resolver** populates `baseTokenRefs` on beans that extend `HealthIndicator`
3. **Plugin (`beforeCodegen`)** detects indicators via `baseTokenRefs`, synthesizes `UptimeHealthIndicator` (with `baseTokenRefs: [HealthIndicator]`) and `HealthAggregator` (with `collection: true` dep on `HealthIndicator`)
4. **Runtime** `ApplicationContext.getAll(HealthIndicator)` resolves all subtypes, injected into `HealthAggregator`'s constructor

## Collection Injection

`HealthAggregator` uses collection injection — the first package to use `baseTokens` + `getAll()`. The constructor receives `HealthIndicator[]` containing all registered subtypes (user-defined + `UptimeHealthIndicator`).

## HealthAggregator Behavior

- `checkAll()` runs all indicators via `Promise.allSettled` (one failure doesn't block others)
- Overall status is `DOWN` if any indicator reports `DOWN` or throws
- Thrown errors are caught and reported as `DOWN` with `error` and `errorType` details
- Warns at construction time about duplicate indicator names

## Gotchas

- The plugin only activates when at least one user-defined `HealthIndicator` subclass exists — if no user indicators are present, no health beans are synthesized
- `UptimeHealthIndicator` is always included when the health subsystem activates
- Indicators must extend `HealthIndicator` (not just implement the interface) for `baseTokenRefs` detection to work
