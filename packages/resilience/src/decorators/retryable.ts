export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). */
  maxAttempts?: number;
  /** Delay between retries in milliseconds (default: 1000). */
  delay?: number;
  /** Multiplier for exponential backoff (default: 1 — no backoff). */
  multiplier?: number;
}

type MethodDecorator_Stage3 = (
  target: (...args: never) => unknown,
  context: ClassMethodDecoratorContext,
) => void;

/**
 * Mark a method for automatic retry on failure.
 *
 * At compile time, the resilience transformer plugin reads this decorator
 * and wires the `RetryInterceptor` via AOP. No runtime metadata is stored.
 */
export function Retryable(_opts?: RetryOptions): MethodDecorator_Stage3 {
  return (_target, _context) => {
    // No-op: read at compile time by the resilience transformer plugin
  };
}
