import { HealthAggregator, UptimeHealthIndicator } from '@goodie-ts/health';
import { Controller, Get } from '@goodie-ts/hono';
import type { Context } from 'hono';
import type { DatabaseHealthIndicator } from './DatabaseHealthIndicator.js';

@Controller('/health')
export class HealthController {
  private readonly aggregator: HealthAggregator;

  constructor(databaseIndicator: DatabaseHealthIndicator) {
    // DatabaseHealthIndicator is DI-managed (receives Database via constructor injection).
    // UptimeHealthIndicator has no dependencies — safe to construct directly.
    this.aggregator = new HealthAggregator([
      new UptimeHealthIndicator(),
      databaseIndicator,
    ]);
  }

  @Get('/')
  async check(c: Context) {
    const health = await this.aggregator.checkAll();
    return c.json(health, health.status === 'UP' ? 200 : 503);
  }
}
