/** Result of a single health check. */
export interface HealthResult {
  status: 'UP' | 'DOWN';
  details?: Record<string, unknown>;
}

/**
 * Abstract base class for health check indicators.
 *
 * Subclass this and decorate with `@Singleton()` to auto-register with
 * `HealthAggregator` via the health transformer plugin.
 */
export abstract class HealthIndicator {
  /** Display name for this indicator (e.g. 'database', 'redis', 'uptime'). */
  abstract readonly name: string;

  /** Perform the health check and return the result. */
  abstract check(): Promise<HealthResult>;
}
