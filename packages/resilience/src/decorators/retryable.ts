import { createAopDecorator } from '@goodie-ts/aop';
import type { RetryInterceptor } from '../retry-interceptor.js';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). */
  maxAttempts?: number;
  /** Delay between retries in milliseconds (default: 1000). */
  delay?: number;
  /** Multiplier for exponential backoff (default: 1 — no backoff). */
  multiplier?: number;
}

/**
 * Mark a method for automatic retry on failure.
 *
 * At compile time, the AOP scanner reads the type parameter
 * and wires the `RetryInterceptor` via AOP. No runtime metadata is stored.
 */
export const Retryable = createAopDecorator<{
  interceptor: RetryInterceptor;
  order: -10;
  defaults: { maxAttempts: 3; delay: 1000; multiplier: 1 };
  args: [opts?: RetryOptions];
}>();
