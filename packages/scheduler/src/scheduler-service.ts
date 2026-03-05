import type { ApplicationContext } from '@goodie-ts/core';
import { Cron } from 'croner';

/** Compile-time metadata for a single @Scheduled method. */
export interface ScheduledMethodMeta {
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
 *
 * At startup, iterates all bean definitions looking for `metadata.scheduledMethods`,
 * resolves each bean, and starts the corresponding schedules.
 */
export class SchedulerService {
  private readonly jobs: ScheduledJob[] = [];
  private started = false;

  constructor(private readonly ctx: ApplicationContext) {}

  /** Start all scheduled jobs. Called automatically via @PostConstruct. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    for (const def of this.ctx.getDefinitions()) {
      const scheduledMethods = def.metadata.scheduledMethods as
        | ScheduledMethodMeta[]
        | undefined;
      if (!scheduledMethods || scheduledMethods.length === 0) continue;

      const bean = await this.ctx.getAsync(def.token);

      for (const meta of scheduledMethods) {
        const label = `${(bean as object).constructor.name}.${meta.methodName}`;
        const method = (
          bean as Record<string, (...args: unknown[]) => unknown>
        )[meta.methodName];
        if (!method) continue;

        const boundMethod = method.bind(bean);

        if (meta.cron !== undefined) {
          this.startCronJob(label, meta.cron, boundMethod, meta.concurrent);
        } else if (meta.fixedRate !== undefined) {
          this.startFixedRateJob(
            label,
            meta.fixedRate,
            boundMethod,
            meta.concurrent,
          );
        } else if (meta.fixedDelay !== undefined) {
          this.startFixedDelayJob(label, meta.fixedDelay, boundMethod);
        }
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
    const inFlight = new Set<Promise<void>>();

    const job = new Cron(cron, () => {
      if (!concurrent && running) return;
      running = true;
      const run = (async () => {
        try {
          await fn();
        } catch (error) {
          console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
        } finally {
          running = false;
        }
      })();
      inFlight.add(run);
      run.finally(() => inFlight.delete(run));
    });

    this.jobs.push({
      label,
      stop: () => job.stop(),
      get drained() {
        return inFlight.size > 0
          ? Promise.all(inFlight).then(() => {})
          : undefined;
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
    const inFlight = new Set<Promise<void>>();

    const timer = setInterval(() => {
      if (!concurrent && running) return;
      running = true;
      const run = (async () => {
        try {
          await fn();
        } catch (error) {
          console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
        } finally {
          running = false;
        }
      })();
      inFlight.add(run);
      run.finally(() => inFlight.delete(run));
    }, intervalMs);

    this.jobs.push({
      label,
      stop: () => clearInterval(timer),
      get drained() {
        return inFlight.size > 0
          ? Promise.all(inFlight).then(() => {})
          : undefined;
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
    let resolveDelay: (() => void) | undefined;

    const loop = async (): Promise<void> => {
      while (!stopped) {
        try {
          await fn();
        } catch (error) {
          console.error(`[@goodie-ts/scheduler] Error in ${label}:`, error);
        }
        if (!stopped) {
          await new Promise<void>((resolve) => {
            resolveDelay = resolve;
            timeoutId = setTimeout(resolve, delayMs);
          });
          resolveDelay = undefined;
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
        if (resolveDelay) resolveDelay();
      },
      drained: loopPromise,
    });
  }
}
