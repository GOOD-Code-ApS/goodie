# @goodie-ts/scheduler

Task scheduling for goodie-ts. `@Scheduled` decorator with compile-time discovery supporting cron expressions, fixed-rate intervals, and fixed-delay loops.

## Key Files

| File | Role |
|------|------|
| `src/decorators/scheduled.ts` | `@Scheduled({ cron?, fixedRate?, fixedDelay?, concurrent? })` -- runtime no-op marker, read at compile time |
| `src/scheduler-service.ts` | `SchedulerService` -- manages scheduled jobs; `addSchedule()`, `start()`, `stop()` |
| `src/scheduler-transformer-plugin.ts` | `createSchedulerPlugin()` -- transformer plugin that scans `@Scheduled` and synthesizes the `SchedulerService` bean |
| `src/metadata.ts` | `SCHEDULER_META` symbols and `ScheduleMetadata` interface (vestigial -- not used at runtime) |
| `src/index.ts` | Public API re-exports |

## How It Works

1. **Compile time:** The `createSchedulerPlugin()` transformer plugin scans methods for `@Scheduled` decorators via `visitMethod`. It extracts `cron`, `fixedRate`, `fixedDelay`, and `concurrent` from the decorator's object literal argument. The plugin validates at compile time that exactly one scheduling mode is specified and that cron expressions are non-empty. In `beforeCodegen`, it synthesizes a `SchedulerService` bean with a `customFactory` that calls `addSchedule()` for each discovered method.
2. **Runtime:** `SchedulerService` stores registered routes and starts them when `start()` is called (via `postConstruct`). On shutdown, `stop()` (via `preDestroy`) cleans up all timers and cron jobs.

## Scheduling Modes

| Mode | Option | Behavior |
|------|--------|----------|
| Cron | `cron: '0 * * * * *'` | 6-field cron expression (sec min hour dom mon dow) via `croner` library |
| Fixed rate | `fixedRate: 5000` | `setInterval` -- fires at constant intervals regardless of execution time |
| Fixed delay | `fixedDelay: 5000` | Async loop -- waits for previous execution to complete, then waits the delay |

## Overlap Prevention

By default, `concurrent` is `false`. For cron and fixedRate jobs, a `running` flag skips the tick if the previous execution is still in progress. For fixedDelay, overlap is inherently impossible since the loop is sequential.

Set `concurrent: true` to allow overlapping executions for cron and fixedRate jobs.

## Lifecycle Integration

The synthesized `SchedulerService` bean has:
- `metadata.postConstructMethods: ['start']` -- starts all jobs after the container is fully initialized
- `metadata.preDestroyMethods: ['stop']` -- stops all jobs and clears timers on shutdown
- `eager: true` -- ensures the service is created during context startup

## Compile-Time Validation

The plugin throws errors at build time for:
- Missing scheduling mode (none of `cron`, `fixedRate`, `fixedDelay` specified)
- Multiple scheduling modes on the same method
- Empty cron expression string

## Gotchas

- The plugin only synthesizes `SchedulerService` when at least one `@Scheduled` method is found (unlike events, which always creates `EventBus`)
- `fixedDelay` jobs start executing immediately on `start()` with no initial delay
- Error handling logs via `console.error` but does not stop the schedule -- jobs continue on the next tick
- The `metadata.ts` symbols are vestigial from an earlier runtime-scanning design
- The plugin is auto-discovered via `package.json` `goodie.plugin` field
- Cron parsing uses the `croner` library (6-field format with seconds)
