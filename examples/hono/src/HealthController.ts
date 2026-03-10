import { HealthAggregator } from '@goodie-ts/health';
import { Controller, Get, Response } from '@goodie-ts/http';
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
  async check() {
    const health = await this.aggregator.checkAll();
    return Response.status(health.status === 'UP' ? 200 : 503, health);
  }
}
