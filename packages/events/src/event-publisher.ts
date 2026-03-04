/**
 * Abstract event publisher — used as an injection token via `baseTokenRefs`.
 *
 * Inject this in your beans to publish events:
 * ```ts
 * @Inject() accessor events!: EventPublisher;
 * ```
 */
export abstract class EventPublisher {
  abstract publish(event: object): Promise<void>;
}
