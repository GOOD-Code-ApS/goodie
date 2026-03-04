/** Metadata keys for scheduler decorators. */
export const SCHEDULER_META = {
  SCHEDULES: Symbol('goodie:scheduler:schedules'),
} as const;

export interface ScheduleMetadata {
  methodName: string;
  /** Cron expression (6 fields: sec min hour dom mon dow). */
  cron?: string;
  /** Fixed-rate interval in milliseconds. */
  fixedRate?: number;
  /** Fixed-delay interval in milliseconds (waits for previous completion). */
  fixedDelay?: number;
  /** Allow concurrent executions. Defaults to false. */
  concurrent: boolean;
}
