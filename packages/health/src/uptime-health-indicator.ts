import type { HealthResult } from './health-indicator.js';
import { HealthIndicator } from './health-indicator.js';

/**
 * Built-in health indicator that reports application uptime.
 *
 * @param startTime - Optional epoch ms for when the application started.
 *                    Defaults to construction time if not provided.
 */
export class UptimeHealthIndicator extends HealthIndicator {
  readonly name = 'uptime';
  private readonly startTime: number;

  constructor(startTime?: number) {
    super();
    this.startTime = startTime ?? Date.now();
  }

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
