import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULER_META, type ScheduleMetadata } from '../src/metadata.js';
import { SchedulerService } from '../src/scheduler-service.js';

/**
 * Create a fake bean with Symbol.metadata populated as if @Scheduled had run.
 */
function createScheduledBean(
  name: string,
  schedules: ScheduleMetadata[],
  methods: Record<string, (...args: unknown[]) => unknown>,
): object {
  const metadata: Record<PropertyKey, unknown> = {
    [SCHEDULER_META.SCHEDULES]: schedules,
  };

  class FakeBean {}
  Object.defineProperty(FakeBean, 'name', { value: name });
  (FakeBean as any)[Symbol.metadata] = metadata;

  const instance = new FakeBean();
  for (const [methodName, fn] of Object.entries(methods)) {
    (instance as any)[methodName] = fn;
  }
  return instance;
}

describe('SchedulerService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should execute fixedRate jobs at the specified interval', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    const bean = createScheduledBean(
      'MyTask',
      [{ methodName: 'run', fixedRate: 100, concurrent: false }],
      { run: handler },
    );

    const service = new SchedulerService(bean);
    service.start();

    expect(handler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(2);

    service.stop();
  });

  it('should prevent concurrent execution when concurrent is false', async () => {
    vi.useFakeTimers();
    let resolveTask: () => void;
    const taskPromise = new Promise<void>((r) => {
      resolveTask = r;
    });
    const handler = vi.fn().mockReturnValue(taskPromise);

    const bean = createScheduledBean(
      'SlowTask',
      [{ methodName: 'run', fixedRate: 50, concurrent: false }],
      { run: handler },
    );

    const service = new SchedulerService(bean);
    service.start();

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

    service.stop();
  });

  it('should isolate errors between scheduled tasks', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingHandler = vi.fn().mockRejectedValue(new Error('task failed'));
    const successHandler = vi.fn();

    const bean1 = createScheduledBean(
      'FailingTask',
      [{ methodName: 'run', fixedRate: 100, concurrent: false }],
      { run: failingHandler },
    );

    const bean2 = createScheduledBean(
      'SuccessTask',
      [{ methodName: 'run', fixedRate: 100, concurrent: false }],
      { run: successHandler },
    );

    const service = new SchedulerService(bean1, bean2);
    service.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(successHandler).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('FailingTask.run'),
      expect.any(Error),
    );

    service.stop();
    errorSpy.mockRestore();
  });

  it('should stop all jobs on stop()', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    const bean = createScheduledBean(
      'MyTask',
      [{ methodName: 'run', fixedRate: 100, concurrent: false }],
      { run: handler },
    );

    const service = new SchedulerService(bean);
    service.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);

    service.stop();

    await vi.advanceTimersByTimeAsync(300);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle beans without metadata gracefully', () => {
    const plainBean = { constructor: class PlainBean {} };
    const service = new SchedulerService(plainBean);
    service.start();
    service.stop();
    // No error
  });

  it('should handle zero beans', () => {
    const service = new SchedulerService();
    service.start();
    service.stop();
    // No error
  });

  it('should handle fixedDelay jobs', async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockImplementation(async () => {});

    const bean = createScheduledBean(
      'DelayTask',
      [{ methodName: 'run', fixedDelay: 100, concurrent: false }],
      { run: handler },
    );

    const service = new SchedulerService(bean);
    service.start();

    // fixedDelay runs immediately, then waits
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(2);

    service.stop();
  });
});
