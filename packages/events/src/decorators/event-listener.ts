type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

export interface EventListenerOptions {
  /** Execution order (lower runs first). Defaults to 0. */
  order?: number;
}

/**
 * Marks a method as an event listener for the given event type.
 *
 * The transformer plugin reads this decorator at compile time to generate
 * static event routing code. At runtime, this decorator is a no-op marker.
 *
 * **Event matching is by exact constructor identity.** If you register for
 * `BaseEvent` and publish `ChildEvent extends BaseEvent`, this listener
 * will NOT fire. Each event type must be registered explicitly.
 *
 * ```ts
 * @EventListener(UserCreatedEvent)
 * async onUserCreated(event: UserCreatedEvent) { ... }
 *
 * @EventListener(OrderEvent, { order: 10 })
 * async onOrder(event: OrderEvent) { ... }
 * ```
 */
export function EventListener(
  _eventType: new (...args: any[]) => object,
  _opts?: EventListenerOptions,
): MethodDecorator_Stage3 {
  return () => {};
}
