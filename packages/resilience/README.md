# @goodie-ts/resilience

Resilience patterns for [goodie-ts](https://github.com/GOOD-Code-ApS/goodie) — retry, circuit breaker, and timeout decorators. Built on the AOP interceptor chain in `@goodie-ts/core`.

## Install

```bash
pnpm add @goodie-ts/resilience
```

## Overview

Declarative resilience via decorators. Interceptors execute in order: **Timeout > Circuit Breaker > Retry > method** — so the timeout covers all retries, and the circuit breaker tracks the overall outcome.

## Decorators

| Decorator | Description | Defaults |
|-----------|-------------|----------|
| `@Retryable({ maxAttempts?, delay?, multiplier? })` | Retry with exponential backoff + jitter | 3 attempts, 1000ms, 2x |
| `@CircuitBreaker({ failureThreshold?, resetTimeout?, halfOpenAttempts? })` | Circuit breaker state machine | 5 failures, 30s reset, 3 probes |
| `@Timeout(durationMs)` | Reject if method exceeds duration | required |

## Usage

```typescript
import { Retryable, CircuitBreaker, Timeout } from '@goodie-ts/resilience';
import { Singleton } from '@goodie-ts/core';

@Singleton()
class PaymentService {
  @Timeout(5000)
  @CircuitBreaker({ failureThreshold: 3, resetTimeout: 10_000 })
  @Retryable({ maxAttempts: 3, delay: 500 })
  async charge(amount: number) {
    return fetch('/api/charge', { body: JSON.stringify({ amount }) });
  }
}
```

## Error Types

- `TimeoutError` — thrown when `@Timeout` duration is exceeded
- `CircuitOpenError` — thrown when the circuit breaker is OPEN and rejecting calls

## Setup

No plugin configuration needed — `@goodie-ts/resilience` ships pre-scanned beans and AOP config in `beans.json`. The transformer auto-discovers them at build time.

## License

[MIT](https://github.com/GOOD-Code-ApS/goodie/blob/main/LICENSE)
