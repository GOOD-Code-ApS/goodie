import { EventPublisher } from './event-publisher.js';

interface ResolvedListener {
  bean: object;
  methodName: string;
  order: number;
}

/**
 * In-memory event bus that routes events to `@EventListener` methods.
 *
 * Synthesized by the events transformer plugin as an eager singleton.
 * The plugin generates a custom factory that calls `register()` for each
 * listener discovered at compile time — no runtime metadata scanning needed.
 *
 * **Event matching is by exact constructor identity.** If a listener registers
 * for `BaseEvent` and you publish `ChildEvent extends BaseEvent`, the listener
 * will NOT fire. Each event type must be registered explicitly.
 */
export class EventBus extends EventPublisher {
  private readonly listenerMap = new Map<
    new (
      ...args: any[]
    ) => object,
    ResolvedListener[]
  >();

  /**
   * Register a listener method for a specific event type.
   * Called by the generated factory at compile time — do not call manually.
   */
  register(
    bean: object,
    methodName: string,
    eventType: new (...args: any[]) => object,
    order: number,
  ): void {
    const existing = this.listenerMap.get(eventType) ?? [];
    existing.push({ bean, methodName, order });
    this.listenerMap.set(eventType, existing);
  }

  /** Sort all listener lists by order. Called after all registrations. */
  sortListeners(): void {
    for (const listeners of this.listenerMap.values()) {
      listeners.sort((a, b) => a.order - b.order);
    }
  }

  /**
   * Publish an event to all registered listeners.
   *
   * Listeners are executed sequentially in order. Errors in one listener
   * do not prevent subsequent listeners from executing (error isolation).
   *
   * **Exact type match only** — matching uses `event.constructor` identity,
   * not the prototype chain. A `ChildEvent extends BaseEvent` will NOT
   * trigger listeners registered for `BaseEvent`.
   */
  async publish(event: object): Promise<void> {
    const ctor = event.constructor as new (...args: any[]) => object;
    const listeners = this.listenerMap.get(ctor);
    if (!listeners) return;

    for (const { bean, methodName } of listeners) {
      try {
        await (bean as Record<string, (...args: unknown[]) => unknown>)[
          methodName
        ](event);
      } catch (error) {
        console.error(
          `[@goodie-ts/events] Error in listener ${bean.constructor.name}.${methodName}:`,
          error,
        );
      }
    }
  }
}
