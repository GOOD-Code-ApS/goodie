import type { ApplicationContext } from '@goodie-ts/core';
import type { ApplicationEvent } from './application-event.js';
import { ApplicationEventListener } from './application-event-listener.js';
import { EventPublisher } from './event-publisher.js';

/**
 * In-memory event bus that routes events to {@link ApplicationEventListener} beans.
 *
 * Synthesized by the events transformer plugin as an eager singleton.
 * Discovers all `ApplicationEventListener` beans via `ApplicationContext.getAll()`
 * and groups them by `eventType` for O(1) dispatch.
 *
 * **Event matching**: by `eventType` property (exact class identity), then
 * `supports()` as a secondary filter. No prototype chain matching.
 */
export class EventBus extends EventPublisher {
  private readonly listenersByType = new Map<
    new (
      ...args: any[]
    ) => ApplicationEvent,
    ApplicationEventListener[]
  >();

  constructor(private readonly ctx: ApplicationContext) {
    super();
  }

  /** Discover and cache all listeners. Called automatically via @PostConstruct. */
  async init(): Promise<void> {
    const listeners = await this.ctx.getAllAsync(ApplicationEventListener);

    for (const listener of listeners) {
      const eventType = listener.eventType;
      const existing = this.listenersByType.get(eventType) ?? [];
      existing.push(listener);
      this.listenersByType.set(eventType, existing);
    }

    // Sort each list by order
    for (const list of this.listenersByType.values()) {
      list.sort((a, b) => a.order - b.order);
    }
  }

  /**
   * Publish an event to all matching listeners.
   *
   * Listeners are matched by `eventType` (exact class identity), then filtered
   * by `supports()`. Matched listeners execute sequentially in order.
   * Errors in one listener do not prevent subsequent listeners from executing.
   */
  async publish(event: ApplicationEvent): Promise<void> {
    const ctor = event.constructor as new (...args: any[]) => ApplicationEvent;
    const listeners = this.listenersByType.get(ctor);
    if (!listeners) return;

    for (const listener of listeners) {
      if (!listener.supports(event)) continue;
      try {
        await listener.onApplicationEvent(event);
      } catch (error) {
        console.error(
          `[@goodie-ts/events] Error in listener ${listener.constructor.name}:`,
          error,
        );
      }
    }
  }
}
