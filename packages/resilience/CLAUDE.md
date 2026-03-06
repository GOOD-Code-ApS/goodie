# @goodie-ts/resilience

Resilience patterns for goodie-ts: `@Retryable`, `@CircuitBreaker`, and `@Timeout` decorators. Built on `@goodie-ts/core` interceptor chain.

## Key Files

| File | Role |
|------|------|
| `src/retry-interceptor.ts` | `RetryInterceptor` — exponential backoff with jitter (order `-10`) |
| `src/circuit-breaker-interceptor.ts` | `CircuitBreakerInterceptor` — state machine: CLOSED → OPEN → HALF_OPEN (order `-20`) |
| `src/timeout-interceptor.ts` | `TimeoutInterceptor` — `Promise.race` timeout enforcement (order `-30`) |
| `src/decorators/retryable.ts` | `@Retryable()` — defined via `createAopDecorator<{ interceptor: RetryInterceptor; order: -10; defaults: {...} }>()` |
| `src/decorators/circuit-breaker.ts` | `@CircuitBreaker()` — defined via `createAopDecorator<{ interceptor: CircuitBreakerInterceptor; order: -20; ... }>()` |
| `src/decorators/timeout.ts` | `@Timeout(duration)` — defined via `createAopDecorator<{ interceptor: TimeoutInterceptor; order: -30; ... }>()` |

## Interceptor Execution Order

The chain runs outermost-first: **Timeout → CircuitBreaker → Retry → method**. This means:
- Timeout covers the entire call including all retries
- Circuit breaker tracks the overall outcome, not individual retry attempts
- Retry only re-calls the target method (inner interceptors are not re-entered)

## Circuit Breaker State Machine

```
CLOSED ──(failures >= threshold)──→ OPEN ──(resetTimeout elapsed)──→ HALF_OPEN
  ↑                                                                      │
  └──────────────(halfOpenAttempts successes)──────────────────────────────┘
                                            failure → back to OPEN
```

Each method gets its own circuit keyed by `className:methodName`. Only one probe call is allowed during HALF_OPEN (concurrent calls are rejected).

## Retry Strategy

Exponential backoff with random jitter (50–100% of computed delay) to prevent thundering herd. On first failure of a sync method, the return becomes a `Promise` due to `setTimeout` — callers should always `await` `@Retryable` methods.

## Library Beans

The package ships three singleton interceptor beans in `beans.json` (`RetryInterceptor`, `CircuitBreakerInterceptor`, `TimeoutInterceptor`). AOP decorator config is also included in the manifest's `aop` section. Consumers auto-discover both at build time.

## Gotchas

- `@Timeout` only works on async methods (sync code blocks the event loop and can't be interrupted)
- `TimeoutInterceptor` uses `clearTimeout` in `.finally()` to prevent timer leaks
- `CircuitOpenError` and `TimeoutError` are exported for catch-based handling
