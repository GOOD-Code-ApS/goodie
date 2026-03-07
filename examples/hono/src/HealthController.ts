import { HealthAggregator } from '@goodie-ts/health';
import { Controller, Get } from '@goodie-ts/http';
import { ApiOperation, ApiResponse, ApiTag } from '@goodie-ts/openapi';
import type { Context } from 'hono';
import type { DatabaseHealthIndicator } from './DatabaseHealthIndicator.js';
import type { UptimeHealthIndicator } from './UptimeHealthIndicator.js';

@Controller('/health')
@ApiTag('Health')
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
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse(200, 'Service is healthy')
  @ApiResponse(503, 'Service is unhealthy')
  async check(c: Context) {
    const health = await this.aggregator.checkAll();
    return c.json(health, health.status === 'UP' ? 200 : 503);
  }
}
