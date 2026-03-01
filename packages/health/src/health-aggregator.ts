import type { HealthIndicator, HealthResult } from './health-indicator.js';

/** Aggregated result from all health indicators. */
export interface AggregatedHealth {
  status: 'UP' | 'DOWN';
  indicators: Record<string, HealthResult>;
}

/**
 * Aggregates multiple HealthIndicator instances and provides a combined health status.
 *
 * Usage: register as a singleton with all HealthIndicator[] injected via constructor.
 * The overall status is DOWN if any indicator reports DOWN.
 */
export class HealthAggregator {
  constructor(private readonly indicators: HealthIndicator[]) {}

  async checkAll(): Promise<AggregatedHealth> {
    // Capture names before any async work so rejection branches can identify the indicator
    const names = this.indicators.map((i) => i.name);
    const results = await Promise.allSettled(
      this.indicators.map(async (indicator) => indicator.check()),
    );

    const indicators: Record<string, HealthResult> = {};
    let overallUp = true;

    for (let i = 0; i < results.length; i++) {
      const settled = results[i];
      const name = names[i];

      if (settled.status === 'fulfilled') {
        indicators[name] = settled.value;
        if (settled.value.status === 'DOWN') {
          overallUp = false;
        }
      } else {
        // If check() rejects, treat it as DOWN with error type info
        const error = settled.reason;
        const errorType =
          error instanceof Error ? error.constructor.name : 'Unknown';
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        indicators[name] = {
          status: 'DOWN',
          details: { error: errorMessage, errorType },
        };
        overallUp = false;
      }
    }

    return {
      status: overallUp ? 'UP' : 'DOWN',
      indicators,
    };
  }
}
