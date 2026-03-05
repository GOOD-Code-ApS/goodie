type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

export interface ScheduledOptions {
  /** Cron expression (6 fields: sec min hour dom mon dow). */
  cron?: string;
  /** Fixed-rate interval in milliseconds. Waits one interval before first execution. */
  fixedRate?: number;
  /** Fixed-delay interval in milliseconds. Runs immediately, then waits for previous completion + delay. */
  fixedDelay?: number;
  /** Allow concurrent executions. Defaults to false. */
  concurrent?: boolean;
}

/**
 * Marks a method as a scheduled task.
 *
 * Exactly one of `cron`, `fixedRate`, or `fixedDelay` must be specified.
 * The transformer plugin validates this at compile time and generates
 * static schedule registration code. At runtime, this decorator is a no-op marker.
 *
 * ```ts
 * @Scheduled({ cron: '0 * * * * *' })
 * async everyMinute() { ... }
 *
 * @Scheduled({ fixedRate: 5000 })
 * async everyFiveSeconds() { ... }
 * ```
 */
export function Scheduled(_opts: ScheduledOptions): MethodDecorator_Stage3 {
  return () => {};
}
