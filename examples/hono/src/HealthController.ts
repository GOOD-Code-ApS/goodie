import { HealthAggregator } from '@goodie-ts/health';
import { Controller, Get } from '@goodie-ts/http';
import type { Context } from 'hono';
import type { DatabaseHealthIndicator } from './DatabaseHealthIndicator.js';
import type { UptimeHealthIndicator } from './UptimeHealthIndicator.js';

@Controller('/health')
export class HealthController {
  private readonly aggregator: HealthAggregator;

  constructor(
    uptimeIndicator: UptimeHealthIndicator,
    databaseIndicator: DatabaseHealthIndicator,
  ) {
    this.aggregator = new HealthAggregator([
      uptimeIndicator,
      databaseIndicator,
    ]);
  }

  @Get('/')
  async check(c: Context) {
    const health = await this.aggregator.checkAll();
    return c.json(health, health.status === 'UP' ? 200 : 503);
  }
}
