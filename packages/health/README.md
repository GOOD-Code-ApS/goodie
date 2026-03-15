# @goodie-ts/health

Health check indicators and aggregation for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie). Auto-discovers `HealthIndicator` subclasses and aggregates their results.

## Install

```bash
pnpm add @goodie-ts/health
```

## Overview

Extend `HealthIndicator` to define custom health checks. The plugin auto-wires a `HealthAggregator` that collects all indicators and reports a combined status.

## Define a Health Indicator

```typescript
import { Singleton } from '@goodie-ts/core';
import { HealthIndicator, HealthResult } from '@goodie-ts/health';

@Singleton()
class DatabaseHealthIndicator extends HealthIndicator {
  readonly name = 'database';

  constructor(private database: Database) {}

  async check(): Promise<HealthResult> {
    try {
      await this.database.kysely.selectFrom('pg_catalog.pg_tables').execute();
      return { status: 'UP' };
    } catch (error) {
      return { status: 'DOWN', details: { error: String(error) } };
    }
  }
}
```

## Use the Aggregator

```typescript
import { Singleton } from '@goodie-ts/core';
import { HealthAggregator } from '@goodie-ts/health';

@Singleton()
class HealthController {
  constructor(private health: HealthAggregator) {}

  async check() {
    const result = await this.health.checkAll();
    // { status: 'UP', indicators: { database: { status: 'UP' }, uptime: { status: 'UP', details: { ... } } } }
    return result;
  }
}
```

## Built-in Indicators

- **UptimeHealthIndicator** — always included, reports application uptime in milliseconds and start time

## Aggregation Behavior

- All indicators run in parallel via `Promise.allSettled`
- Overall status is `DOWN` if any indicator reports `DOWN` or throws
- Thrown errors are caught and reported as `DOWN` with error details

## Setup

Health components are auto-discovered from `components.json` — no manual plugin registration needed:

```typescript
import { diPlugin } from '@goodie-ts/vite-plugin';

export default defineConfig({
  plugins: [diPlugin()],
});
```

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
