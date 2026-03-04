import { EventPublisher } from './event-publisher.js';
import { EVENTS_META, type ListenerMetadata } from './metadata.js';

interface ResolvedListener {
  bean: object;
  methodName: string;
  order: number;
}

/**
 * In-memory event bus that routes events to `@EventListener` methods.
 *
 * Synthesized by the events transformer plugin as an eager singleton.
 * Constructor receives all listener beans as rest params.
 * Reads `Symbol.metadata` from each bean's constructor to build the routing table.
 */
export class EventBus extends EventPublisher {
  private readonly listenerMap = new Map<
    new (
      ...args: any[]
    ) => object,
    ResolvedListener[]
  >();

  constructor(...beans: object[]) {
    super();
    for (const bean of beans) {
      const metadata = (
        bean.constructor as { [Symbol.metadata]?: Record<PropertyKey, unknown> }
      )[Symbol.metadata];
      if (!metadata) continue;

      const listeners = metadata[EVENTS_META.LISTENERS] as
        | ListenerMetadata[]
        | undefined;
      if (!listeners) continue;

      for (const listener of listeners) {
        const existing = this.listenerMap.get(listener.eventType) ?? [];
        existing.push({
          bean,
          methodName: listener.methodName,
          order: listener.order,
        });
        this.listenerMap.set(listener.eventType, existing);
      }
    }

    // Sort each event type's listeners by order (ascending)
    for (const listeners of this.listenerMap.values()) {
      listeners.sort((a, b) => a.order - b.order);
    }
  }

  /**
   * Publish an event to all registered listeners.
   *
   * Listeners are executed sequentially in order. Errors in one listener
   * do not prevent subsequent listeners from executing (error isolation).
   * Exact type match only — no prototype chain walking.
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
