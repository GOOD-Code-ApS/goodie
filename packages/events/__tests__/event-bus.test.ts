import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/event-bus.js';

class UserCreatedEvent {
  constructor(public readonly userId: string) {}
}

class OrderPlacedEvent {
  constructor(public readonly orderId: string) {}
}

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

describe('EventBus', () => {
  it('should route events to matching listeners', async () => {
    const handler = vi.fn();
    const bean = createBeanWithMethods('UserHandler', {
      onUserCreated: handler,
    });

    const bus = new EventBus();
    bus.register(bean, 'onUserCreated', UserCreatedEvent, 0);
    bus.sortListeners();

    const event = new UserCreatedEvent('user-1');
    await bus.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not route events to non-matching listeners', async () => {
    const handler = vi.fn();
    const bean = createBeanWithMethods('UserHandler', {
      onUserCreated: handler,
    });

    const bus = new EventBus();
    bus.register(bean, 'onUserCreated', UserCreatedEvent, 0);
    bus.sortListeners();

    await bus.publish(new OrderPlacedEvent('order-1'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('should execute listeners in order', async () => {
    const callOrder: number[] = [];

    const bean1 = createBeanWithMethods('FirstHandler', {
      handle: () => callOrder.push(10),
    });
    const bean2 = createBeanWithMethods('SecondHandler', {
      handle: () => callOrder.push(-5),
    });
    const bean3 = createBeanWithMethods('ThirdHandler', {
      handle: () => callOrder.push(0),
    });

    const bus = new EventBus();
    bus.register(bean1, 'handle', UserCreatedEvent, 10);
    bus.register(bean2, 'handle', UserCreatedEvent, -5);
    bus.register(bean3, 'handle', UserCreatedEvent, 0);
    bus.sortListeners();

    await bus.publish(new UserCreatedEvent('user-1'));

    expect(callOrder).toEqual([-5, 0, 10]);
  });

  it('should isolate errors between listeners', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const handler1 = vi.fn().mockRejectedValue(new Error('boom'));
    const handler2 = vi.fn();

    const bean1 = createBeanWithMethods('FailingHandler', {
      handle: handler1,
    });
    const bean2 = createBeanWithMethods('SuccessHandler', {
      handle: handler2,
    });

    const bus = new EventBus();
    bus.register(bean1, 'handle', UserCreatedEvent, 0);
    bus.register(bean2, 'handle', UserCreatedEvent, 1);
    bus.sortListeners();

    await bus.publish(new UserCreatedEvent('user-1'));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('FailingHandler.handle'),
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  it('should handle multiple event types from the same bean', async () => {
    const userHandler = vi.fn();
    const orderHandler = vi.fn();

    const bean = createBeanWithMethods('MultiHandler', {
      onUser: userHandler,
      onOrder: orderHandler,
    });

    const bus = new EventBus();
    bus.register(bean, 'onUser', UserCreatedEvent, 0);
    bus.register(bean, 'onOrder', OrderPlacedEvent, 0);
    bus.sortListeners();

    await bus.publish(new UserCreatedEvent('user-1'));
    expect(userHandler).toHaveBeenCalledTimes(1);
    expect(orderHandler).not.toHaveBeenCalled();

    await bus.publish(new OrderPlacedEvent('order-1'));
    expect(orderHandler).toHaveBeenCalledTimes(1);
  });

  it('should handle zero listeners without errors', async () => {
    const bus = new EventBus();
    await bus.publish(new UserCreatedEvent('user-1'));
    // No error — just no listeners matched
  });

  it('should await async listeners sequentially', async () => {
    const callOrder: string[] = [];

    const bean = createBeanWithMethods('AsyncHandler', {
      slow: async () => {
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('slow');
      },
      fast: async () => {
        callOrder.push('fast');
      },
    });

    const bus = new EventBus();
    bus.register(bean, 'slow', UserCreatedEvent, 0);
    bus.register(bean, 'fast', UserCreatedEvent, 1);
    bus.sortListeners();

    await bus.publish(new UserCreatedEvent('user-1'));

    expect(callOrder).toEqual(['slow', 'fast']);
  });
});
