export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5). */
  failureThreshold?: number;
  /** Time in ms before moving from OPEN to HALF_OPEN (default: 30000). */
  resetTimeout?: number;
  /** Number of successes in HALF_OPEN needed to close the circuit (default: 1). */
  halfOpenAttempts?: number;
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Mark a method for circuit breaker protection.
 *
 * At compile time, the resilience transformer plugin reads this decorator
 * and wires the `CircuitBreakerInterceptor` via AOP.
 */
export function CircuitBreaker(
  _opts?: CircuitBreakerOptions,
): MethodDecorator_Stage3 {
  return (_target, _context) => {
    // No-op: read at compile time by the resilience transformer plugin
  };
}
