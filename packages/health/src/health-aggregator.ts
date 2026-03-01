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
    const results = await Promise.allSettled(
      this.indicators.map(async (indicator) => ({
        name: indicator.name,
        result: await indicator.check(),
      })),
    );

    const indicators: Record<string, HealthResult> = {};
    let overallUp = true;

    for (const settled of results) {
      if (settled.status === 'fulfilled') {
        indicators[settled.value.name] = settled.value.result;
        if (settled.value.result.status === 'DOWN') {
          overallUp = false;
        }
      } else {
        // If check() rejects, treat it as DOWN
        const errorMessage =
          settled.reason instanceof Error
            ? settled.reason.message
            : String(settled.reason);
        indicators['unknown'] = {
          status: 'DOWN',
          details: { error: errorMessage },
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
