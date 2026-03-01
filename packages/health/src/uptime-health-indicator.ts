import type { HealthIndicator, HealthResult } from './health-indicator.js';

/**
 * Built-in health indicator that reports application uptime.
 *
 * @param startTime - Optional epoch ms for when the application started.
 *                    Defaults to construction time if not provided.
 */
export class UptimeHealthIndicator implements HealthIndicator {
  readonly name = 'uptime';
  private readonly startTime: number;

  constructor(startTime?: number) {
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
