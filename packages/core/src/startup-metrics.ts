/**
 * Lightweight startup timing collector for ApplicationContext.
 * Only collects data when GOODIE_DEBUG=true.
 */
export class StartupMetrics {
  private readonly timings = new Map<string, number>();
  private readonly beanTimings = new Map<string, number>();
  private totalMs = 0;

  /**
   * Time a synchronous stage and record its duration.
   */
  timeStageSync<T>(name: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    this.timings.set(name, performance.now() - start);
    return result;
  }

  /**
   * Time an async stage and record its duration.
   */
  async timeStage<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    this.timings.set(name, performance.now() - start);
    return result;
  }

  /**
   * Record a per-bean resolution time.
   */
  recordBean(name: string, ms: number): void {
    this.beanTimings.set(name, ms);
  }

  /**
   * Set the total startup time.
   */
  setTotal(ms: number): void {
    this.totalMs = ms;
  }

  /**
   * Get the duration of a named stage in milliseconds, or undefined if not recorded.
   */
  getStage(name: string): number | undefined {
    return this.timings.get(name);
  }

  /**
   * Get per-bean resolution timings.
   */
  getBeanTimings(): ReadonlyMap<string, number> {
    return this.beanTimings;
  }

  /**
   * Get total startup time in milliseconds.
   */
  getTotal(): number {
    return this.totalMs;
  }

  /**
   * Print a formatted summary to console.
   */
  print(): void {
    console.log('[goodie] Startup metrics');
    console.log('[goodie] ──────────────────────────────');

    for (const [name, ms] of this.timings) {
      console.log(`[goodie]   ${name}: ${ms.toFixed(2)}ms`);
    }

    console.log(`[goodie] ──────────────────────────────`);
    console.log(`[goodie]   total: ${this.totalMs.toFixed(2)}ms`);

    if (this.beanTimings.size > 0) {
      console.log('[goodie]');
      console.log('[goodie] Eager bean resolution');
      console.log('[goodie] ──────────────────────────────');
      for (const [name, ms] of this.beanTimings) {
        console.log(`[goodie]   ${name}: ${ms.toFixed(2)}ms`);
      }
    }
  }
}

/**
 * Check whether startup metrics collection is enabled.
 */
export function isMetricsEnabled(): boolean {
  return typeof process !== 'undefined' && process.env?.GOODIE_DEBUG === 'true';
}
