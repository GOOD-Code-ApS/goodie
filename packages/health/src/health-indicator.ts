/** Result of a single health check. */
export interface HealthResult {
  status: 'UP' | 'DOWN';
  details?: Record<string, unknown>;
}

/** Interface for health check indicators. */
export interface HealthIndicator {
  /** Display name for this indicator (e.g. 'database', 'redis', 'uptime'). */
  readonly name: string;

  /** Perform the health check and return the result. */
  check(): Promise<HealthResult>;
}
