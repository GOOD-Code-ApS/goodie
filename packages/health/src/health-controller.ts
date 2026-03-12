import { Controller, Get, Response } from '@goodie-ts/http';
import type { HealthAggregator } from './health-aggregator.js';

/**
 * Health check endpoint.
 *
 * Returns 200 with aggregated health when all indicators are UP,
 * or 503 when any indicator is DOWN.
 */
@Controller('/health')
export class HealthController {
  constructor(private readonly healthAggregator: HealthAggregator) {}

  @Get('/')
  async check() {
    const health = await this.healthAggregator.checkAll();
    return Response.status(health.status === 'UP' ? 200 : 503, health);
  }
}
