import { EVENTS_META, type ListenerMetadata } from '../metadata.js';

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
 * ```ts
 * @EventListener(UserCreatedEvent)
 * async onUserCreated(event: UserCreatedEvent) { ... }
 * ```
 */
export function EventListener(
  eventType: new (...args: any[]) => object,
  opts?: EventListenerOptions,
): MethodDecorator_Stage3 {
  return (_target, context) => {
    const entry: ListenerMetadata = {
      methodName: String(context.name),
      eventType,
      order: opts?.order ?? 0,
    };
    const existing: ListenerMetadata[] =
      (context.metadata[EVENTS_META.LISTENERS] as ListenerMetadata[]) ?? [];
    existing.push(entry);
    context.metadata[EVENTS_META.LISTENERS] = existing;
  };
}
