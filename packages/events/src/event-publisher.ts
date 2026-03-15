import type { ApplicationEvent } from './application-event.js';

/**
 * Abstract event publisher — used as an injection token via `baseTokenRefs`.
 *
 * Inject this in your components to publish events:
 * ```ts
 * @Inject() accessor events!: EventPublisher;
 * ```
 */
export abstract class EventPublisher {
  abstract publish(event: ApplicationEvent): Promise<void>;
}
