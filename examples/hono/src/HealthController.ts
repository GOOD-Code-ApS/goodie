import { HealthAggregator, UptimeHealthIndicator } from '@goodie-ts/health';
import { Controller, Get } from '@goodie-ts/hono';
import type { Context } from 'hono';
import type { Database } from './Database.js';
import { DatabaseHealthIndicator } from './DatabaseHealthIndicator.js';

@Controller('/health')
export class HealthController {
  private readonly aggregator: HealthAggregator;

  constructor(database: Database) {
    this.aggregator = new HealthAggregator([
      new UptimeHealthIndicator(),
      new DatabaseHealthIndicator(database),
    ]);
  }

  @Get('/')
  async check(c: Context) {
    const health = await this.aggregator.checkAll();
    return c.json(health, health.status === 'UP' ? 200 : 503);
  }
}
