# @goodie-ts/logging

Method-level logging for goodie-ts via `@Log` decorator and `LoggerFactory` static API. Built on `@goodie-ts/core` interceptor chain.

## Key Files

| File | Role |
|------|------|
| `src/logging-interceptor.ts` | `LoggingInterceptor` — AOP interceptor that logs method entry/exit with timing |
| `src/logger.ts` | `Logger` interface + `ConsoleLogger` default implementation |
| `src/logger-factory.ts` | `LoggerFactory` — static factory for obtaining `Logger` instances (delegate pattern) |
| `src/mdc.ts` | `MDC` — Mapped Diagnostic Context via `AsyncLocalStorage` |
| `src/decorators/log.ts` | `@Log()` — defined via `createAopDecorator<{ interceptor: LoggingInterceptor; order: -100 }>()` |

## Two Logging Approaches

1. **AOP (`@Log` decorator):** Automatic entry/exit logging on decorated methods. Uses `LoggingInterceptor` which runs at order `-100` (outermost).
2. **Imperative (`LoggerFactory.getLogger()`):** Static API for manual logging inside method bodies. `private static readonly log = LoggerFactory.getLogger(MyClass)`.

Both share the same `LoggerFactory` backend, so AOP and imperative loggers use the same instances.

## LoggerFactory Delegate Pattern

`getLogger()` returns a lightweight delegate object that resolves the real logger on each call. This means `setFactory()` retroactively affects all previously obtained loggers — safe to use in static field initializers regardless of import order.

## MDC (Mapped Diagnostic Context)

`MDC` is backed by `AsyncLocalStorage`. Use `MDC.run(context, fn)` in middleware to set request-scoped values (e.g. `traceId`). The `LoggingInterceptor` automatically includes MDC context in log output.

## AOP Wiring

The `@Log` decorator is defined via `createAopDecorator()` with AOP config in the type parameter. At library build time, the transformer's AOP scanner extracts the config and includes it in `beans.json`. The `LoggingInterceptor` singleton bean is also shipped in `beans.json`. Consumers auto-discover both at build time — no plugin setup needed.

## Gotchas

- `@Log({ logArgs: true })` must be explicitly opted in — args are not logged by default (PII security)
- `LoggerFactory.setFactory()` clears the resolved cache, so existing loggers pick up the new factory
- The `LoggingInterceptor` constructor accepts an optional factory function for custom loggers
