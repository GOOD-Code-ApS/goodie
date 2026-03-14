import type { ComponentDefinition } from '@goodie-ts/core';
import { ApplicationContext } from '@goodie-ts/core';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationEvent } from '../src/application-event.js';
import { ApplicationEventListener } from '../src/application-event-listener.js';
import { EventBus } from '../src/event-bus.js';

class UserCreatedEvent extends ApplicationEvent {
  constructor(public readonly userId: string) {
    super();
  }
}

class OrderPlacedEvent extends ApplicationEvent {
  constructor(public readonly orderId: string) {
    super();
  }
}

/** Build an ApplicationContext with listener beans and an EventBus. */
async function createEventBusContext(
  listeners: ApplicationEventListener[],
): Promise<EventBus> {
  const definitions: ComponentDefinition[] = listeners.map((listener) => ({
    token: listener.constructor as new (...args: any[]) => unknown,
    scope: 'singleton' as const,
    dependencies: [],
    factory: () => listener,
    eager: false,
    baseTokens: [ApplicationEventListener],
    metadata: {},
  }));

  const ctx = await ApplicationContext.create(definitions);
  const bus = new EventBus(ctx);
  await bus.init();
  return bus;
}

class UserCreatedListener extends ApplicationEventListener<UserCreatedEvent> {
  readonly eventType = UserCreatedEvent;
  handler = vi.fn();

  onApplicationEvent(event: UserCreatedEvent) {
    this.handler(event);
  }
}

class OrderPlacedListener extends ApplicationEventListener<OrderPlacedEvent> {
  readonly eventType = OrderPlacedEvent;
  handler = vi.fn();

  onApplicationEvent(event: OrderPlacedEvent) {
    this.handler(event);
  }
}

describe('EventBus', () => {
  it('should route events to matching listeners', async () => {
    const listener = new UserCreatedListener();
    const bus = await createEventBusContext([listener]);

    const event = new UserCreatedEvent('user-1');
    await bus.publish(event);

    expect(listener.handler).toHaveBeenCalledWith(event);
    expect(listener.handler).toHaveBeenCalledTimes(1);
  });

  it('should not route events to non-matching listeners', async () => {
    const listener = new UserCreatedListener();
    const bus = await createEventBusContext([listener]);

    await bus.publish(new OrderPlacedEvent('order-1'));

    expect(listener.handler).not.toHaveBeenCalled();
  });

  it('should execute listeners in order', async () => {
    const callOrder: number[] = [];

    class FirstListener extends ApplicationEventListener<UserCreatedEvent> {
      readonly eventType = UserCreatedEvent;
      get order() {
        return 10;
      }
      onApplicationEvent() {
        callOrder.push(10);
      }
    }
    class SecondListener extends ApplicationEventListener<UserCreatedEvent> {
      readonly eventType = UserCreatedEvent;
      get order() {
        return -5;
      }
      onApplicationEvent() {
        callOrder.push(-5);
      }
    }
    class ThirdListener extends ApplicationEventListener<UserCreatedEvent> {
      readonly eventType = UserCreatedEvent;
      get order() {
        return 0;
      }
      onApplicationEvent() {
        callOrder.push(0);
      }
    }

    const bus = await createEventBusContext([
      new FirstListener(),
      new SecondListener(),
      new ThirdListener(),
    ]);

    await bus.publish(new UserCreatedEvent('user-1'));

    expect(callOrder).toEqual([-5, 0, 10]);
  });

  it('should isolate errors between listeners', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    class FailingListener extends ApplicationEventListener<UserCreatedEvent> {
      readonly eventType = UserCreatedEvent;
      onApplicationEvent() {
        throw new Error('boom');
      }
    }

    const successListener = new UserCreatedListener();

    const bus = await createEventBusContext([
      new FailingListener(),
      successListener,
    ]);

    await bus.publish(new UserCreatedEvent('user-1'));

    expect(successListener.handler).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('FailingListener'),
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  it('should handle multiple event types', async () => {
    const userListener = new UserCreatedListener();
    const orderListener = new OrderPlacedListener();

    const bus = await createEventBusContext([userListener, orderListener]);

    await bus.publish(new UserCreatedEvent('user-1'));
    expect(userListener.handler).toHaveBeenCalledTimes(1);
    expect(orderListener.handler).not.toHaveBeenCalled();

    await bus.publish(new OrderPlacedEvent('order-1'));
    expect(orderListener.handler).toHaveBeenCalledTimes(1);
  });

  it('should handle zero listeners without errors', async () => {
    const ctx = await ApplicationContext.create([]);
    const bus = new EventBus(ctx);
    await bus.init();
    await bus.publish(new UserCreatedEvent('user-1'));
    // No error — just no listeners matched
  });

  it('should await async listeners sequentially', async () => {
    const callOrder: string[] = [];

    class SlowListener extends ApplicationEventListener<UserCreatedEvent> {
      readonly eventType = UserCreatedEvent;
      get order() {
        return 0;
      }
      async onApplicationEvent() {
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('slow');
      }
    }
    class FastListener extends ApplicationEventListener<UserCreatedEvent> {
      readonly eventType = UserCreatedEvent;
      get order() {
        return 1;
      }
      async onApplicationEvent() {
        callOrder.push('fast');
      }
    }

    const bus = await createEventBusContext([
      new SlowListener(),
      new FastListener(),
    ]);

    await bus.publish(new UserCreatedEvent('user-1'));

    expect(callOrder).toEqual(['slow', 'fast']);
  });

  it('should respect supports() for conditional filtering', async () => {
    class HighValueOrderEvent extends ApplicationEvent {
      constructor(readonly total: number) {
        super();
      }
    }

    class HighValueOrderListener extends ApplicationEventListener<HighValueOrderEvent> {
      readonly eventType = HighValueOrderEvent;
      handler = vi.fn();

      supports(event: ApplicationEvent): boolean {
        return (event as HighValueOrderEvent).total > 10_000;
      }

      onApplicationEvent(event: HighValueOrderEvent) {
        this.handler(event);
      }
    }

    const listener = new HighValueOrderListener();
    const bus = await createEventBusContext([listener]);

    // Low value — should not trigger
    await bus.publish(new HighValueOrderEvent(500));
    expect(listener.handler).not.toHaveBeenCalled();

    // High value — should trigger
    await bus.publish(new HighValueOrderEvent(50_000));
    expect(listener.handler).toHaveBeenCalledTimes(1);
  });
});
