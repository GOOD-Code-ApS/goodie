# @goodie-ts/events

Event publishing and listener support for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie). Compile-time discovery with sequential async dispatch.

## Install

```bash
pnpm add @goodie-ts/events
```

## Overview

Declarative event handling using the `ApplicationEventListener` abstract class pattern. The transformer plugin discovers listener subclasses at compile time and generates static wiring code. At runtime, `EventBus` dispatches events sequentially to registered listeners with error isolation.

## Usage

```typescript
import {
  ApplicationEvent,
  ApplicationEventListener,
  EventPublisher,
} from '@goodie-ts/events';
import { Singleton, Inject } from '@goodie-ts/core';

// Define an event class
class UserCreatedEvent extends ApplicationEvent {
  constructor(public readonly userId: string) {
    super();
  }
}

// Listen for events
@Singleton()
class UserCreatedListener extends ApplicationEventListener<UserCreatedEvent> {
  readonly eventType = UserCreatedEvent;

  async onApplicationEvent(event: UserCreatedEvent) {
    console.log(`User created: ${event.userId}`);
  }
}

// Optional: override supports() for conditional filtering
@Singleton()
class HighValueOrderListener extends ApplicationEventListener<OrderEvent> {
  readonly eventType = OrderEvent;

  supports(event: OrderEvent) {
    return event.total > 10_000;
  }

  async onApplicationEvent(event: OrderEvent) {
    console.log('High value order!');
  }

  // Optional: control execution order (lower = earlier, default 0)
  get order() {
    return 10;
  }
}

// Publish events
@Singleton()
class UserService {
  @Inject() accessor events!: EventPublisher;

  async createUser(name: string) {
    const userId = '123';
    await this.events.publish(new UserCreatedEvent(userId));
  }
}
```

## Setup

No plugin configuration needed -- `@goodie-ts/events` is auto-discovered by the transformer at build time via `package.json` `goodie.plugin` field.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
