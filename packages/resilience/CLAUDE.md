# @goodie-ts/resilience

Resilience patterns for goodie-ts: `@Retryable`, `@CircuitBreaker`, and `@Timeout` decorators. Built on `@goodie-ts/aop` interceptor chain.

## Key Files

| File | Role |
|------|------|
| `src/retry-interceptor.ts` | `RetryInterceptor` — exponential backoff with jitter (order `-10`) |
| `src/circuit-breaker-interceptor.ts` | `CircuitBreakerInterceptor` — state machine: CLOSED → OPEN → HALF_OPEN (order `-30`) |
| `src/timeout-interceptor.ts` | `TimeoutInterceptor` — `Promise.race` timeout enforcement (order `-50`) |
| `src/resilience-transformer-plugin.ts` | `createResiliencePlugin()` — scans decorators, synthesizes interceptor beans |
| `src/decorators/retryable.ts` | `@Retryable({ maxAttempts?, delay?, multiplier? })` |
| `src/decorators/circuit-breaker.ts` | `@CircuitBreaker({ failureThreshold?, resetTimeout?, halfOpenAttempts? })` |
| `src/decorators/timeout.ts` | `@Timeout(durationMs)` |

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

## Plugin Bean Synthesis

The plugin synthesizes singleton beans for each interceptor type that has at least one usage. A `beforeScan` hook clears state for watch-mode compatibility.

## Gotchas

- `@Timeout` only works on async methods (sync code blocks the event loop and can't be interrupted)
- `TimeoutInterceptor` uses `clearTimeout` in `.finally()` to prevent timer leaks
- `CircuitOpenError` and `TimeoutError` are exported for catch-based handling
