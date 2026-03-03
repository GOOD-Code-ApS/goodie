import { Singleton } from '@goodie-ts/decorators';
import type { HealthIndicator, HealthResult } from '@goodie-ts/health';

@Singleton()
export class UptimeHealthIndicator implements HealthIndicator {
  readonly name = 'uptime';
  private readonly startTime = Date.now();

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
