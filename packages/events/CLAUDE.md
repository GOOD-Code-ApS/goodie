# @goodie-ts/events

Event publishing and listener support for goodie-ts. `ApplicationEventListener` abstract class pattern with compile-time discovery and `EventBus` with sequential async dispatch.

## Key Files

| File | Role |
|------|------|
| `src/application-event.ts` | `ApplicationEvent` -- base class for all events |
| `src/application-event-listener.ts` | `ApplicationEventListener<E>` -- abstract base class with `eventType`, `supports()`, `onApplicationEvent()`, `order` |
| `src/event-bus.ts` | `EventBus` -- in-memory event dispatcher; discovers listeners via `ApplicationContext.getAllAsync()`, groups by `eventType`, O(1) dispatch |
| `src/event-publisher.ts` | `EventPublisher` -- abstract base class used as injection token via `baseTokenRefs` |
| `src/events-transformer-plugin.ts` | `createEventsPlugin()` -- transformer plugin that detects `extends ApplicationEventListener` and synthesizes the `EventBus` bean |
| `src/index.ts` | Public API re-exports |

## How It Works

1. **Compile time:** The `createEventsPlugin()` transformer plugin detects classes extending `ApplicationEventListener` via `visitClass`. It marks them with `__isEventListener` metadata. In `beforeCodegen`, it adds `baseTokenRefs` pointing to `ApplicationEventListener` (so `getAll()` can discover them) and synthesizes an `EventBus` bean that depends on `ApplicationContext`.
2. **Runtime:** `EventBus` takes `ApplicationContext` as a constructor dep. In `init()` (via `@PostConstruct`), it calls `ctx.getAllAsync(ApplicationEventListener)` to discover all listener beans, groups them by `eventType`, and sorts by `order`. When `publish(event)` is called, it matches by `event.constructor` identity, filters by `supports()`, then dispatches sequentially.

## Design Decisions

- **ApplicationEventListener pattern** -- Listeners are classes extending `ApplicationEventListener<E>`, not `@EventListener` method decorators. This is the Micronaut-inspired pattern and avoids `customFactory` complexity. Listeners declare their `eventType` as a property, enabling O(1) dispatch.
- **`supports()` secondary filter** -- Beyond type matching, listeners can override `supports(event)` for conditional filtering (e.g. only events with `total > 10_000`).
- **Exact-match dispatch** -- `publish()` matches by `event.constructor` identity, not the prototype chain. A `ChildEvent extends BaseEvent` will NOT trigger listeners registered for `BaseEvent`.
- **Sequential async execution** -- Listeners run one at a time in order (`for...of` with `await`), not concurrently.
- **Error isolation** -- A throwing listener logs the error but does not prevent subsequent listeners from executing.
- **Always-present EventBus** -- The plugin creates an `EventBus` bean even when zero listeners are found, allowing `EventPublisher` injection in publish-only code.
- **Eager singleton** -- `EventBus` is created eagerly so listener discovery happens during context startup.
- **`baseTokenRefs`** -- `EventBus` registers under `EventPublisher` for interface injection. Listener beans register under `ApplicationEventListener` for `getAll()` discovery.
- **ApplicationContext self-registration** -- `ApplicationContext` registers itself as a bean so both `EventBus` and `SchedulerService` can inject it as a constructor dep.

## Gotchas

- No hierarchical event matching -- registering for a base class does NOT catch subclass events
- Events must extend `ApplicationEvent`
- Listeners must extend `ApplicationEventListener<E>` and declare `readonly eventType = EventClass`
- The plugin is auto-discovered via `package.json` `goodie.plugin` field
