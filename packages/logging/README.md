# @goodie-ts/logging

Method logging for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) — `@Log` decorator and `LoggerFactory` static API. Built on the AOP interceptor chain in `@goodie-ts/core`.

## Install

```bash
pnpm add @goodie-ts/logging
```

## Overview

Two approaches: **AOP** (`@Log`) for automatic entry/exit logging, and **imperative** (`LoggerFactory.getLogger()`) for manual logging. Both share the same backend and can be used together.

## AOP Logging

```typescript
import { Log } from '@goodie-ts/logging';
import { Singleton } from '@goodie-ts/core';

@Singleton()
class UserService {
  @Log()
  async findAll() { /* logged automatically */ }

  @Log({ level: 'debug', logArgs: true })
  async findById(id: string) { /* args included in log */ }
}
```

## Imperative Logging

```typescript
import { LoggerFactory } from '@goodie-ts/logging';
import { Singleton } from '@goodie-ts/core';

@Singleton()
class OrderService {
  private static readonly log = LoggerFactory.getLogger(OrderService);

  async create(order: Order) {
    OrderService.log.info('Creating order', { orderId: order.id });
    // ...
  }
}
```

## Custom Logger (pino, winston, etc.)

```typescript
import { LoggerFactory } from '@goodie-ts/logging';
import pino from 'pino';

const pinoLogger = pino();
LoggerFactory.setFactory((name) => ({
  debug: (msg, meta) => pinoLogger.child({ name }).debug(meta, msg),
  info: (msg, meta) => pinoLogger.child({ name }).info(meta, msg),
  warn: (msg, meta) => pinoLogger.child({ name }).warn(meta, msg),
  error: (msg, meta) => pinoLogger.child({ name }).error(meta, msg),
}));
```

## MDC (Mapped Diagnostic Context)

```typescript
import { MDC } from '@goodie-ts/logging';

// In middleware:
MDC.run(new Map([['traceId', crypto.randomUUID()]]), async () => {
  // All logs within this context include traceId
  await next();
});
```

## Setup

No plugin configuration needed — `@goodie-ts/logging` ships pre-scanned beans and AOP config in `beans.json`. The transformer auto-discovers them at build time.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
