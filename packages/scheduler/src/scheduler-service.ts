import { Cron } from 'croner';

/** A scheduled method registration, populated at compile time by the plugin. */
export interface ScheduleRoute {
  bean: object;
  methodName: string;
  cron?: string;
  fixedRate?: number;
  fixedDelay?: number;
  concurrent: boolean;
}

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
 * The plugin generates a custom factory that calls `addSchedule()` for each
 * scheduled method discovered at compile time — no runtime metadata scanning needed.
 */
export class SchedulerService {
  private readonly jobs: ScheduledJob[] = [];
  private readonly routes: ScheduleRoute[] = [];
  private started = false;

  /**
   * Register a scheduled method. Called by the generated factory at compile time.
   */
  addSchedule(
    bean: object,
    methodName: string,
    opts: {
      cron?: string;
      fixedRate?: number;
      fixedDelay?: number;
      concurrent: boolean;
    },
  ): void {
    this.routes.push({ bean, methodName, ...opts });
  }

  /** Start all scheduled jobs. Called automatically via @PostConstruct. */
  start(): void {
    if (this.started) return;
    this.started = true;

    for (const route of this.routes) {
      const label = `${route.bean.constructor.name}.${route.methodName}`;
      const method = (
        route.bean as Record<string, (...args: unknown[]) => unknown>
      )[route.methodName];
      if (!method) continue;

      const boundMethod = method.bind(route.bean);

      if (route.cron) {
        this.startCronJob(label, route.cron, boundMethod, route.concurrent);
      } else if (route.fixedRate !== undefined) {
        this.startFixedRateJob(
          label,
          route.fixedRate,
          boundMethod,
          route.concurrent,
        );
      } else if (route.fixedDelay !== undefined) {
        this.startFixedDelayJob(label, route.fixedDelay, boundMethod);
      }
    }
  }

  /** Stop all scheduled jobs. Called automatically via @PreDestroy. */
  stop(): void {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs.length = 0;
    this.started = false;
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
