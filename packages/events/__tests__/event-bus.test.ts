import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/event-bus.js';
import { EVENTS_META, type ListenerMetadata } from '../src/metadata.js';

class UserCreatedEvent {
  constructor(public readonly userId: string) {}
}

class OrderPlacedEvent {
  constructor(public readonly orderId: string) {}
}

/**
 * Create a fake bean with Symbol.metadata populated as if @EventListener had run.
 */
function createListenerBean(
  name: string,
  listeners: ListenerMetadata[],
  methods: Record<string, (...args: unknown[]) => unknown>,
): object {
  const metadata: Record<PropertyKey, unknown> = {
    [EVENTS_META.LISTENERS]: listeners,
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

describe('EventBus', () => {
  it('should route events to matching listeners', async () => {
    const handler = vi.fn();
    const bean = createListenerBean(
      'UserHandler',
      [{ methodName: 'onUserCreated', eventType: UserCreatedEvent, order: 0 }],
      { onUserCreated: handler },
    );

    const bus = new EventBus(bean);
    const event = new UserCreatedEvent('user-1');
    await bus.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not route events to non-matching listeners', async () => {
    const handler = vi.fn();
    const bean = createListenerBean(
      'UserHandler',
      [{ methodName: 'onUserCreated', eventType: UserCreatedEvent, order: 0 }],
      { onUserCreated: handler },
    );

    const bus = new EventBus(bean);
    await bus.publish(new OrderPlacedEvent('order-1'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('should execute listeners in order', async () => {
    const callOrder: number[] = [];

    const bean1 = createListenerBean(
      'FirstHandler',
      [{ methodName: 'handle', eventType: UserCreatedEvent, order: 10 }],
      { handle: () => callOrder.push(10) },
    );

    const bean2 = createListenerBean(
      'SecondHandler',
      [{ methodName: 'handle', eventType: UserCreatedEvent, order: -5 }],
      { handle: () => callOrder.push(-5) },
    );

    const bean3 = createListenerBean(
      'ThirdHandler',
      [{ methodName: 'handle', eventType: UserCreatedEvent, order: 0 }],
      { handle: () => callOrder.push(0) },
    );

    const bus = new EventBus(bean1, bean2, bean3);
    await bus.publish(new UserCreatedEvent('user-1'));

    expect(callOrder).toEqual([-5, 0, 10]);
  });

  it('should isolate errors between listeners', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const handler1 = vi.fn().mockRejectedValue(new Error('boom'));
    const handler2 = vi.fn();

    const bean1 = createListenerBean(
      'FailingHandler',
      [{ methodName: 'handle', eventType: UserCreatedEvent, order: 0 }],
      { handle: handler1 },
    );

    const bean2 = createListenerBean(
      'SuccessHandler',
      [{ methodName: 'handle', eventType: UserCreatedEvent, order: 1 }],
      { handle: handler2 },
    );

    const bus = new EventBus(bean1, bean2);
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

    const bean = createListenerBean(
      'MultiHandler',
      [
        { methodName: 'onUser', eventType: UserCreatedEvent, order: 0 },
        { methodName: 'onOrder', eventType: OrderPlacedEvent, order: 0 },
      ],
      { onUser: userHandler, onOrder: orderHandler },
    );

    const bus = new EventBus(bean);

    await bus.publish(new UserCreatedEvent('user-1'));
    expect(userHandler).toHaveBeenCalledTimes(1);
    expect(orderHandler).not.toHaveBeenCalled();

    await bus.publish(new OrderPlacedEvent('order-1'));
    expect(orderHandler).toHaveBeenCalledTimes(1);
  });

  it('should handle beans without metadata gracefully', async () => {
    const plainBean = { constructor: class PlainBean {} };
    const bus = new EventBus(plainBean);
    await bus.publish(new UserCreatedEvent('user-1'));
    // No error — just no listeners matched
  });

  it('should handle zero listeners without errors', async () => {
    const bus = new EventBus();
    await bus.publish(new UserCreatedEvent('user-1'));
    // No error — just no listeners matched
  });

  it('should await async listeners sequentially', async () => {
    const callOrder: string[] = [];

    const bean = createListenerBean(
      'AsyncHandler',
      [
        { methodName: 'slow', eventType: UserCreatedEvent, order: 0 },
        { methodName: 'fast', eventType: UserCreatedEvent, order: 1 },
      ],
      {
        slow: async () => {
          await new Promise((r) => setTimeout(r, 10));
          callOrder.push('slow');
        },
        fast: async () => {
          callOrder.push('fast');
        },
      },
    );

    const bus = new EventBus(bean);
    await bus.publish(new UserCreatedEvent('user-1'));

    expect(callOrder).toEqual(['slow', 'fast']);
  });
});
