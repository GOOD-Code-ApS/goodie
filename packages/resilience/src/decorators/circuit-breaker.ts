import { createAopDecorator } from '@goodie-ts/aop';
import type { CircuitBreakerInterceptor } from '../circuit-breaker-interceptor.js';

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5). */
  failureThreshold?: number;
  /** Time in ms before moving from OPEN to HALF_OPEN (default: 30000). */
  resetTimeout?: number;
  /** Number of successes in HALF_OPEN needed to close the circuit (default: 1). */
  halfOpenAttempts?: number;
}

/**
 * Mark a method for circuit breaker protection.
 *
 * At compile time, the AOP scanner reads the type parameter
 * and wires the `CircuitBreakerInterceptor` via AOP.
 */
export const CircuitBreaker = createAopDecorator<{
  interceptor: CircuitBreakerInterceptor;
  order: -20;
  defaults: { failureThreshold: 5; resetTimeout: 30000; halfOpenAttempts: 1 };
  args: [opts?: CircuitBreakerOptions];
}>();
