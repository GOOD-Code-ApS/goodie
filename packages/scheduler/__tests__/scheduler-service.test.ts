import type { ComponentDefinition } from '@goodie-ts/core';
import { ApplicationContext } from '@goodie-ts/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledMethodMeta } from '../src/scheduler-service.js';
import { SchedulerService } from '../src/scheduler-service.js';

/** Build an ApplicationContext with the given components and their scheduled metadata. */
async function createSchedulerContext(
  components: Array<{
    instance: object;
    token: new (...args: any[]) => unknown;
    scheduledMethods: ScheduledMethodMeta[];
  }>,
): Promise<{ ctx: ApplicationContext; service: SchedulerService }> {
  const definitions: ComponentDefinition[] = components.map((b) => ({
    token: b.token,
    scope: 'singleton' as const,
    dependencies: [],
    factory: () => b.instance,
    eager: false,
    metadata: { scheduledMethods: b.scheduledMethods },
  }));

  const ctx = await ApplicationContext.create(definitions);
  const service = new SchedulerService(ctx);
  return { ctx, service };
}

describe('SchedulerService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should execute fixedRate jobs at the specified interval', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    class MyTask {
      run = handler;
    }
    const instance = new MyTask();

    const { service } = await createSchedulerContext([
      {
        instance,
        token: MyTask,
        scheduledMethods: [
          { methodName: 'run', fixedRate: 100, concurrent: false },
        ],
      },
    ]);
    await service.start();

    expect(handler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(2);

    await service.stop();
  });

  it('should prevent concurrent execution when concurrent is false', async () => {
    vi.useFakeTimers();
    let resolveTask: () => void;
    const taskPromise = new Promise<void>((r) => {
      resolveTask = r;
    });
    const handler = vi.fn().mockReturnValue(taskPromise);

    class SlowTask {
      run = handler;
    }
    const instance = new SlowTask();

    const { service } = await createSchedulerContext([
      {
        instance,
        token: SlowTask,
        scheduledMethods: [
          { methodName: 'run', fixedRate: 50, concurrent: false },
        ],
      },
    ]);
    await service.start();

    // First tick — starts the task
    await vi.advanceTimersByTimeAsync(50);
    expect(handler).toHaveBeenCalledTimes(1);

    // Second tick — should be skipped (still running)
    await vi.advanceTimersByTimeAsync(50);
    expect(handler).toHaveBeenCalledTimes(1);

    // Resolve the first task
    resolveTask!();
    await vi.advanceTimersByTimeAsync(0);

    // Third tick — should run again
    await vi.advanceTimersByTimeAsync(50);
    expect(handler).toHaveBeenCalledTimes(2);

    await service.stop();
  });

  it('should isolate errors between scheduled tasks', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingHandler = vi.fn().mockRejectedValue(new Error('task failed'));
    const successHandler = vi.fn();

    class FailingTask {
      run = failingHandler;
    }
    class SuccessTask {
      run = successHandler;
    }

    const { service } = await createSchedulerContext([
      {
        instance: new FailingTask(),
        token: FailingTask,
        scheduledMethods: [
          { methodName: 'run', fixedRate: 100, concurrent: false },
        ],
      },
      {
        instance: new SuccessTask(),
        token: SuccessTask,
        scheduledMethods: [
          { methodName: 'run', fixedRate: 100, concurrent: false },
        ],
      },
    ]);
    await service.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(successHandler).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('FailingTask.run'),
      expect.any(Error),
    );

    await service.stop();
    errorSpy.mockRestore();
  });

  it('should stop all jobs on stop()', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    class MyTask {
      run = handler;
    }

    const { service } = await createSchedulerContext([
      {
        instance: new MyTask(),
        token: MyTask,
        scheduledMethods: [
          { methodName: 'run', fixedRate: 100, concurrent: false },
        ],
      },
    ]);
    await service.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);

    await service.stop();

    await vi.advanceTimersByTimeAsync(300);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle zero schedules', async () => {
    const ctx = await ApplicationContext.create([]);
    const service = new SchedulerService(ctx);
    await service.start();
    await service.stop();
    // No error
  });

  it('should handle fixedDelay jobs', async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockImplementation(async () => {});

    class DelayTask {
      run = handler;
    }

    const { service } = await createSchedulerContext([
      {
        instance: new DelayTask(),
        token: DelayTask,
        scheduledMethods: [
          { methodName: 'run', fixedDelay: 100, concurrent: false },
        ],
      },
    ]);
    await service.start();

    // fixedDelay runs immediately, then waits
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(2);

    await service.stop();
  });

  it('should prevent double-init when start() is called twice', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    class MyTask {
      run = handler;
    }

    const { service } = await createSchedulerContext([
      {
        instance: new MyTask(),
        token: MyTask,
        scheduledMethods: [
          { methodName: 'run', fixedRate: 100, concurrent: false },
        ],
      },
    ]);

    await service.start();
    await service.start(); // second call should be a no-op

    await vi.advanceTimersByTimeAsync(100);
    // Should only have 1 call (not 2 from double scheduling)
    expect(handler).toHaveBeenCalledTimes(1);

    await service.stop();
  });

  it('should skip components without scheduledMethods metadata', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    class ScheduledTask {
      run = handler;
    }
    class PlainService {}

    const definitions: ComponentDefinition[] = [
      {
        token: PlainService,
        scope: 'singleton',
        dependencies: [],
        factory: () => new PlainService(),
        eager: false,
        metadata: {},
      },
      {
        token: ScheduledTask,
        scope: 'singleton',
        dependencies: [],
        factory: () => new ScheduledTask(),
        eager: false,
        metadata: {
          scheduledMethods: [
            { methodName: 'run', fixedRate: 100, concurrent: false },
          ],
        },
      },
    ];

    const ctx = await ApplicationContext.create(definitions);
    const service = new SchedulerService(ctx);
    await service.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);

    await service.stop();
  });
});
