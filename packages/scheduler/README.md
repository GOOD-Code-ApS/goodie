# @goodie-ts/scheduler

Task scheduling for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) via decorators. Compile-time discovery with cron, fixed-rate, and fixed-delay support.

## Install

```bash
pnpm add @goodie-ts/scheduler
```

## Overview

Declarative task scheduling using the `@Scheduled` decorator. The transformer plugin discovers scheduled methods at compile time and generates static wiring code. At runtime, `SchedulerService` manages cron jobs, interval timers, and delay loops with automatic lifecycle integration.

## Decorator

| Option | Type | Description |
|--------|------|-------------|
| `cron` | `string` | 6-field cron expression (sec min hour dom mon dow) |
| `fixedRate` | `number` | Interval in milliseconds (fires regardless of execution time) |
| `fixedDelay` | `number` | Delay in milliseconds (waits for previous execution to complete) |
| `concurrent` | `boolean` | Allow overlapping executions (default: `false`) |

Exactly one of `cron`, `fixedRate`, or `fixedDelay` must be specified.

**Note:** `fixedDelay` runs immediately on startup then waits the specified delay between executions. `fixedRate` waits one interval before the first execution. `cron` follows the cron schedule.

## Usage

```typescript
import { Scheduled } from '@goodie-ts/scheduler';
import { Singleton } from '@goodie-ts/decorators';

@Singleton()
class BackgroundTasks {
  @Scheduled({ cron: '0 * * * * *' })
  async everyMinute() {
    console.log('Runs every minute');
  }

  @Scheduled({ fixedRate: 5000 })
  async pollExternalApi() {
    console.log('Runs every 5 seconds');
  }

  @Scheduled({ fixedDelay: 10000 })
  async processQueue() {
    console.log('Runs 10 seconds after previous execution completes');
  }
}
```

## Setup

No plugin configuration needed -- `@goodie-ts/scheduler` is auto-discovered by the transformer at build time via `package.json` `goodie.plugin` field.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
