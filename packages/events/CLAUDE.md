# @goodie-ts/events

Event publishing and listener support for goodie-ts. `@EventListener` decorator with compile-time discovery and `EventBus` with sequential async dispatch.

## Key Files

| File | Role |
|------|------|
| `src/decorators/event-listener.ts` | `@EventListener(EventClass, { order? })` -- runtime no-op marker, read at compile time |
| `src/event-bus.ts` | `EventBus` -- in-memory event dispatcher; `register()`, `sortListeners()`, `publish()` |
| `src/event-publisher.ts` | `EventPublisher` -- abstract base class used as injection token via `baseTokenRefs` |
| `src/events-transformer-plugin.ts` | `createEventsPlugin()` -- transformer plugin that scans `@EventListener` and synthesizes the `EventBus` bean |
| `src/metadata.ts` | `EVENTS_META` symbols and `ListenerMetadata` interface (not used at runtime -- compile-time only) |
| `src/index.ts` | Public API re-exports |

## How It Works

1. **Compile time:** The `createEventsPlugin()` transformer plugin scans methods for `@EventListener(EventClass)` decorators via `visitMethod`. It extracts the event type name, import path, and optional `order` from decorator arguments. In `beforeCodegen`, it synthesizes an `EventBus` bean definition with a `customFactory` that calls `register()` for each discovered listener and `sortListeners()` after all registrations. The `codegen` hook emits import statements for event type classes used in the factory.
2. **Runtime:** `EventBus` extends `EventPublisher` (abstract). The generated factory constructs the bus, registers all listeners with their event types and orders, then sorts. When `publish(event)` is called, it looks up listeners by `event.constructor` identity and calls them sequentially in order.

## Design Decisions

- **Exact-match dispatch** -- `publish()` matches by `event.constructor` identity, not the prototype chain. A `ChildEvent extends BaseEvent` will NOT trigger listeners registered for `BaseEvent`. Each event type must be registered explicitly.
- **Sequential async execution** -- Listeners run one at a time in order (`for...of` with `await`), not concurrently. This guarantees ordering and simplifies reasoning about side effects.
- **Error isolation** -- A throwing listener logs the error via `console.error` but does not prevent subsequent listeners from executing.
- **Always-present EventBus** -- The plugin creates an `EventBus` bean even when zero listeners are found. This allows injecting `EventPublisher` without compile-time errors in code that only publishes.
- **Eager singleton** -- `EventBus` is created eagerly so all listener registrations happen during context startup.
- **baseTokenRefs** -- `EventBus` registers under `EventPublisher` so consumers inject the abstract type: `@Inject() accessor events!: EventPublisher`.

## Gotchas

- No hierarchical event matching -- registering for a base class does NOT catch subclass events
- The `metadata.ts` symbols are vestigial from an earlier runtime-scanning design; they are not used in the current compile-time approach
- Event type import paths are resolved by scanning the source file's import declarations, so the event class must be imported (not inlined)
- The plugin is auto-discovered via `package.json` `goodie.plugin` field -- no manual registration needed
