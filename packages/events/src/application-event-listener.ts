import type { ApplicationEvent } from './application-event.js';

/**
 * Abstract base class for event listeners.
 *
 * Extend this class and declare `eventType` to listen for a specific event:
 * ```ts
 * @Singleton()
 * class UserCreatedListener extends ApplicationEventListener<UserCreatedEvent> {
 *   readonly eventType = UserCreatedEvent;
 *   onApplicationEvent(event: UserCreatedEvent) { console.log(event.userId); }
 * }
 * ```
 *
 * Override `supports()` for conditional filtering beyond type matching:
 * ```ts
 * supports(event: ApplicationEvent): boolean {
 *   return (event as OrderPlacedEvent).total > 10_000;
 * }
 * ```
 */
export abstract class ApplicationEventListener<
  E extends ApplicationEvent = ApplicationEvent,
> {
  /** The event class this listener handles. Used for type matching and O(1) dispatch. */
  abstract readonly eventType: new (
    ...args: any[]
  ) => E;

  /**
   * Override for conditional filtering beyond type matching.
   * Called only for events that already match `eventType`.
   * Default: accept all matching events.
   */
  supports(_event: ApplicationEvent): boolean {
    return true;
  }

  /** Handle the event. May be sync or async. */
  abstract onApplicationEvent(event: E): Promise<void> | void;

  /** Listener ordering. Lower values execute first. Default: 0. */
  get order(): number {
    return 0;
  }
}
