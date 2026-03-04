import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchedulerService } from '../src/scheduler-service.js';

function createBeanWithMethods(
  name: string,
  methods: Record<string, (...args: unknown[]) => unknown>,
): object {
  class FakeBean {}
  Object.defineProperty(FakeBean, 'name', { value: name });
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
    const bean = createBeanWithMethods('MyTask', { run: handler });

    const service = new SchedulerService();
    service.addSchedule(bean, 'run', {
      fixedRate: 100,
      concurrent: false,
    });
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
    const bean = createBeanWithMethods('SlowTask', { run: handler });

    const service = new SchedulerService();
    service.addSchedule(bean, 'run', {
      fixedRate: 50,
      concurrent: false,
    });
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

    const bean1 = createBeanWithMethods('FailingTask', {
      run: failingHandler,
    });
    const bean2 = createBeanWithMethods('SuccessTask', {
      run: successHandler,
    });

    const service = new SchedulerService();
    service.addSchedule(bean1, 'run', {
      fixedRate: 100,
      concurrent: false,
    });
    service.addSchedule(bean2, 'run', {
      fixedRate: 100,
      concurrent: false,
    });
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
    const bean = createBeanWithMethods('MyTask', { run: handler });

    const service = new SchedulerService();
    service.addSchedule(bean, 'run', {
      fixedRate: 100,
      concurrent: false,
    });
    service.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(1);

    service.stop();

    await vi.advanceTimersByTimeAsync(300);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle zero schedules', () => {
    const service = new SchedulerService();
    service.start();
    service.stop();
    // No error
  });

  it('should handle fixedDelay jobs', async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockImplementation(async () => {});
    const bean = createBeanWithMethods('DelayTask', { run: handler });

    const service = new SchedulerService();
    service.addSchedule(bean, 'run', {
      fixedDelay: 100,
      concurrent: false,
    });
    service.start();

    // fixedDelay runs immediately, then waits
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(handler).toHaveBeenCalledTimes(2);

    service.stop();
  });

  it('should prevent double-init when start() is called twice', async () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const bean = createBeanWithMethods('MyTask', { run: handler });

    const service = new SchedulerService();
    service.addSchedule(bean, 'run', {
      fixedRate: 100,
      concurrent: false,
    });

    service.start();
    service.start(); // second call should be a no-op

    await vi.advanceTimersByTimeAsync(100);
    // Should only have 1 call (not 2 from double scheduling)
    expect(handler).toHaveBeenCalledTimes(1);

    service.stop();
  });
});
