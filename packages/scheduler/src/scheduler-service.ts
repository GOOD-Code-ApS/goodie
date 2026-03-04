import { Cron } from 'croner';
import { SCHEDULER_META, type ScheduleMetadata } from './metadata.js';

interface ScheduledJob {
  /** Human-readable label for logging. */
  label: string;
  /** Stop function — clears interval/cron. */
  stop: () => void;
}

/**
 * Manages scheduled tasks discovered via `@Scheduled` decorators.
 *
 * Synthesized by the scheduler transformer plugin as an eager singleton
 * with `postConstructMethods: ['start']` and `preDestroyMethods: ['stop']`.
 * Constructor receives all scheduled beans as rest params.
 */
export class SchedulerService {
  private readonly jobs: ScheduledJob[] = [];
  private readonly beans: object[];

  constructor(...beans: object[]) {
    this.beans = beans;
  }

  /** Start all scheduled jobs. Called automatically via @PostConstruct. */
  start(): void {
    for (const bean of this.beans) {
      const metadata = (
        bean.constructor as { [Symbol.metadata]?: Record<PropertyKey, unknown> }
      )[Symbol.metadata];
      if (!metadata) continue;

      const schedules = metadata[SCHEDULER_META.SCHEDULES] as
        | ScheduleMetadata[]
        | undefined;
      if (!schedules) continue;

      for (const schedule of schedules) {
        const label = `${bean.constructor.name}.${schedule.methodName}`;
        const method = (
          bean as Record<string, (...args: unknown[]) => unknown>
        )[schedule.methodName];
        if (!method) continue;

        const boundMethod = method.bind(bean);

        if (schedule.cron) {
          this.startCronJob(
            label,
            schedule.cron,
            boundMethod,
            schedule.concurrent,
          );
        } else if (schedule.fixedRate !== undefined) {
          this.startFixedRateJob(
            label,
            schedule.fixedRate,
            boundMethod,
            schedule.concurrent,
          );
        } else if (schedule.fixedDelay !== undefined) {
          this.startFixedDelayJob(label, schedule.fixedDelay, boundMethod);
        }
      }
    }
  }

  /** Stop all scheduled jobs. Called automatically via @PreDestroy. */
  stop(): void {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs.length = 0;
  }

  private startCronJob(
    label: string,
    cron: string,
    fn: () => unknown,
    concurrent: boolean,
  ): void {
    let running = false;

    const job = new Cron(cron, async () => {
      if (!concurrent && running) return;
      running = true;
      try {
        await fn();
      } catch (error) {
        console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
      } finally {
        running = false;
      }
    });

    this.jobs.push({
      label,
      stop: () => job.stop(),
    });
  }

  private startFixedRateJob(
    label: string,
    intervalMs: number,
    fn: () => unknown,
    concurrent: boolean,
  ): void {
    let running = false;

    const timer = setInterval(async () => {
      if (!concurrent && running) return;
      running = true;
      try {
        await fn();
      } catch (error) {
        console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
      } finally {
        running = false;
      }
    }, intervalMs);

    this.jobs.push({
      label,
      stop: () => clearInterval(timer),
    });
  }

  private startFixedDelayJob(
    label: string,
    delayMs: number,
    fn: () => unknown,
  ): void {
    let stopped = false;

    const loop = async (): Promise<void> => {
      while (!stopped) {
        try {
          await fn();
        } catch (error) {
          console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
        }
        if (!stopped) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    };

    // Start the loop — fire-and-forget
    loop();

    this.jobs.push({
      label,
      stop: () => {
        stopped = true;
      },
    });
  }
}
