# @goodie-ts/events

Event publishing and listener support for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie). Compile-time discovery with sequential async dispatch.

## Install

```bash
pnpm add @goodie-ts/events
```

## Overview

Declarative event handling using `@EventListener` decorators. The transformer plugin discovers listeners at compile time and generates static wiring code. At runtime, `EventBus` dispatches events sequentially to registered listeners with error isolation.

## Usage

```typescript
import { EventListener } from '@goodie-ts/events';
import { EventPublisher } from '@goodie-ts/events';
import { Singleton, Inject } from '@goodie-ts/decorators';

// Define an event class
class UserCreatedEvent {
  constructor(public readonly userId: string) {}
}

// Listen for events
@Singleton()
class NotificationService {
  @EventListener(UserCreatedEvent)
  async onUserCreated(event: UserCreatedEvent) {
    console.log(`User created: ${event.userId}`);
  }

  @EventListener(UserCreatedEvent, { order: 10 })
  async sendWelcomeEmail(event: UserCreatedEvent) {
    // Runs after onUserCreated (higher order = later)
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
