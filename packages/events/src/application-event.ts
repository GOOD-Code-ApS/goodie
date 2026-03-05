/**
 * Base class for application events.
 *
 * All events published through the EventBus must extend this class:
 * ```ts
 * class UserCreatedEvent extends ApplicationEvent {
 *   constructor(readonly userId: string) { super(); }
 * }
 * ```
 */
export class ApplicationEvent {}
