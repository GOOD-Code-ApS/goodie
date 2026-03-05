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
  /** Stop function — clears interval/cron/loop. */
  stop: () => void;
  /** Promise that resolves when any in-flight execution completes. */
  drained?: Promise<void>;
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

  /** Stop all scheduled jobs and await in-flight executions. Called automatically via @PreDestroy. */
  async stop(): Promise<void> {
    for (const job of this.jobs) {
      job.stop();
    }
    // Await any in-flight task executions before returning
    await Promise.all(this.jobs.map((j) => j.drained).filter(Boolean));
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
    let currentRun: Promise<void> | undefined;

    const job = new Cron(cron, () => {
      if (!concurrent && running) return;
      running = true;
      currentRun = (async () => {
        try {
          await fn();
        } catch (error) {
          console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
        } finally {
          running = false;
        }
      })();
    });

    this.jobs.push({
      label,
      stop: () => job.stop(),
      get drained() {
        return currentRun;
      },
    });
  }

  private startFixedRateJob(
    label: string,
    intervalMs: number,
    fn: () => unknown,
    concurrent: boolean,
  ): void {
    let running = false;
    let currentRun: Promise<void> | undefined;

    const timer = setInterval(() => {
      if (!concurrent && running) return;
      running = true;
      currentRun = (async () => {
        try {
          await fn();
        } catch (error) {
          console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
        } finally {
          running = false;
        }
      })();
    }, intervalMs);

    this.jobs.push({
      label,
      stop: () => clearInterval(timer),
      get drained() {
        return currentRun;
      },
    });
  }

  private startFixedDelayJob(
    label: string,
    delayMs: number,
    fn: () => unknown,
  ): void {
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const loop = async (): Promise<void> => {
      while (!stopped) {
        try {
          await fn();
        } catch (error) {
          console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
        }
        if (!stopped) {
          await new Promise<void>((resolve) => {
            timeoutId = setTimeout(resolve, delayMs);
          });
        }
      }
    };

    // Start the loop — tracked for graceful drain on stop()
    const loopPromise = loop();

    this.jobs.push({
      label,
      stop: () => {
        stopped = true;
        if (timeoutId) clearTimeout(timeoutId);
      },
      drained: loopPromise,
    });
  }
}
