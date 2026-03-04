import { SCHEDULER_META, type ScheduleMetadata } from '../metadata.js';

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

export interface ScheduledOptions {
  /** Cron expression (6 fields: sec min hour dom mon dow). */
  cron?: string;
  /** Fixed-rate interval in milliseconds. */
  fixedRate?: number;
  /** Fixed-delay interval in milliseconds (waits for previous completion). */
  fixedDelay?: number;
  /** Allow concurrent executions. Defaults to false. */
  concurrent?: boolean;
}

/**
 * Marks a method as a scheduled task.
 *
 * Exactly one of `cron`, `fixedRate`, or `fixedDelay` must be specified.
 *
 * ```ts
 * @Scheduled({ cron: '0 * * * * *' })
 * async everyMinute() { ... }
 *
 * @Scheduled({ fixedRate: 5000 })
 * async everyFiveSeconds() { ... }
 * ```
 */
export function Scheduled(opts: ScheduledOptions): MethodDecorator_Stage3 {
  return (_target, context) => {
    const entry: ScheduleMetadata = {
      methodName: String(context.name),
      cron: opts.cron,
      fixedRate: opts.fixedRate,
      fixedDelay: opts.fixedDelay,
      concurrent: opts.concurrent ?? false,
    };
    const existing: ScheduleMetadata[] =
      (context.metadata[SCHEDULER_META.SCHEDULES] as ScheduleMetadata[]) ?? [];
    existing.push(entry);
    context.metadata[SCHEDULER_META.SCHEDULES] = existing;
  };
}
