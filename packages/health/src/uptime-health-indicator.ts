import { Singleton } from '@goodie-ts/decorators';
import type { HealthResult } from './health-indicator.js';
import { HealthIndicator } from './health-indicator.js';

/**
 * Built-in health indicator that reports application uptime.
 * Always reports UP with uptime duration in details.
 */
@Singleton()
export class UptimeHealthIndicator extends HealthIndicator {
  readonly name = 'uptime';
  private readonly startTime: number = Date.now();

  async check(): Promise<HealthResult> {
    const uptimeMs = Date.now() - this.startTime;
    return {
      status: 'UP',
      details: {
        uptimeMs,
        startedAt: new Date(this.startTime).toISOString(),
      },
    };
  }
}
