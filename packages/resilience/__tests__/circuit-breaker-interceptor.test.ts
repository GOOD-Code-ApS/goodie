import type { InvocationContext } from '@goodie-ts/aop';
import { describe, expect, it, vi } from 'vitest';
import {
  CircuitBreakerInterceptor,
  CircuitOpenError,
} from '../src/circuit-breaker-interceptor.js';

function createContext(
  overrides?: Partial<InvocationContext>,
): InvocationContext {
  return {
    className: 'TodoService',
    methodName: 'findAll',
    args: [],
    target: {},
    proceed: () => 'ok',
    ...overrides,
  };
}

describe('CircuitBreakerInterceptor', () => {
  it('should pass through when no metadata is present', () => {
    const interceptor = new CircuitBreakerInterceptor();
    const ctx = createContext({ proceed: () => 'direct' });
    expect(interceptor.intercept(ctx)).toBe('direct');
  });

  it('should start in CLOSED state and pass through', () => {
    const interceptor = new CircuitBreakerInterceptor();

    const ctx = createContext({
      proceed: () => 'success',
      metadata: {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    expect(interceptor.intercept(ctx)).toBe('success');
    expect(interceptor.getCircuitState('TodoService', 'findAll')).toBe(
      'CLOSED',
    );
  });

  it('should transition to OPEN after failure threshold', () => {
    const interceptor = new CircuitBreakerInterceptor();

    const ctx = createContext({
      proceed: () => {
        throw new Error('fail');
      },
      metadata: {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    // Fail 3 times to reach threshold
    for (let i = 0; i < 3; i++) {
      expect(() => interceptor.intercept(ctx)).toThrow('fail');
    }

    expect(interceptor.getCircuitState('TodoService', 'findAll')).toBe('OPEN');
  });

  it('should reject calls when circuit is OPEN', () => {
    const interceptor = new CircuitBreakerInterceptor();

    const failCtx = createContext({
      proceed: () => {
        throw new Error('fail');
      },
      metadata: {
        failureThreshold: 2,
        resetTimeout: 60000,
        halfOpenAttempts: 1,
      },
    });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      expect(() => interceptor.intercept(failCtx)).toThrow('fail');
    }

    // Next call should be rejected with CircuitOpenError
    const successCtx = createContext({
      proceed: () => 'should not reach',
      metadata: {
        failureThreshold: 2,
        resetTimeout: 60000,
        halfOpenAttempts: 1,
      },
    });

    expect(() => interceptor.intercept(successCtx)).toThrow(CircuitOpenError);
  });

  it('should transition to HALF_OPEN after reset timeout', () => {
    vi.useFakeTimers();
    const interceptor = new CircuitBreakerInterceptor();

    const failCtx = createContext({
      proceed: () => {
        throw new Error('fail');
      },
      metadata: {
        failureThreshold: 2,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      expect(() => interceptor.intercept(failCtx)).toThrow('fail');
    }
    expect(interceptor.getCircuitState('TodoService', 'findAll')).toBe('OPEN');

    // Advance time past reset timeout
    vi.advanceTimersByTime(1100);

    // Next call should go through (HALF_OPEN)
    const successCtx = createContext({
      proceed: () => 'recovered',
      metadata: {
        failureThreshold: 2,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    expect(interceptor.intercept(successCtx)).toBe('recovered');
    expect(interceptor.getCircuitState('TodoService', 'findAll')).toBe(
      'CLOSED',
    );

    vi.useRealTimers();
  });

  it('should return to OPEN if HALF_OPEN attempt fails', () => {
    vi.useFakeTimers();
    const interceptor = new CircuitBreakerInterceptor();

    const failCtx = createContext({
      proceed: () => {
        throw new Error('fail');
      },
      metadata: {
        failureThreshold: 2,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      expect(() => interceptor.intercept(failCtx)).toThrow('fail');
    }

    // Advance time past reset timeout
    vi.advanceTimersByTime(1100);

    // HALF_OPEN attempt fails → back to OPEN
    expect(() => interceptor.intercept(failCtx)).toThrow('fail');
    expect(interceptor.getCircuitState('TodoService', 'findAll')).toBe('OPEN');

    vi.useRealTimers();
  });

  it('should handle async methods', async () => {
    const interceptor = new CircuitBreakerInterceptor();
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        if (callCount <= 2) return Promise.reject(new Error('async fail'));
        return Promise.resolve('ok');
      },
      metadata: {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    // Two async failures
    await expect(interceptor.intercept(ctx)).rejects.toThrow('async fail');
    await expect(interceptor.intercept(ctx)).rejects.toThrow('async fail');
    expect(interceptor.getCircuitState('TodoService', 'findAll')).toBe(
      'CLOSED',
    );

    // Third async success
    const result = await interceptor.intercept(ctx);
    expect(result).toBe('ok');
  });

  it('should reset failure count on success in CLOSED state', () => {
    const interceptor = new CircuitBreakerInterceptor();
    let shouldFail = true;

    const ctx = createContext({
      proceed: () => {
        if (shouldFail) throw new Error('fail');
        return 'ok';
      },
      metadata: {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    // 2 failures (below threshold)
    expect(() => interceptor.intercept(ctx)).toThrow('fail');
    expect(() => interceptor.intercept(ctx)).toThrow('fail');

    // 1 success — should reset counter
    shouldFail = false;
    expect(interceptor.intercept(ctx)).toBe('ok');

    // 2 more failures — should still be CLOSED (counter was reset)
    shouldFail = true;
    expect(() => interceptor.intercept(ctx)).toThrow('fail');
    expect(() => interceptor.intercept(ctx)).toThrow('fail');
    expect(interceptor.getCircuitState('TodoService', 'findAll')).toBe(
      'CLOSED',
    );
  });

  it('should maintain separate circuits per method', () => {
    const interceptor = new CircuitBreakerInterceptor();

    const ctxA = createContext({
      methodName: 'findAll',
      proceed: () => {
        throw new Error('fail');
      },
      metadata: {
        failureThreshold: 2,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    const ctxB = createContext({
      methodName: 'findById',
      proceed: () => 'ok',
      metadata: {
        failureThreshold: 2,
        resetTimeout: 1000,
        halfOpenAttempts: 1,
      },
    });

    // Open circuit for findAll
    for (let i = 0; i < 2; i++) {
      expect(() => interceptor.intercept(ctxA)).toThrow('fail');
    }

    expect(interceptor.getCircuitState('TodoService', 'findAll')).toBe('OPEN');
    expect(interceptor.getCircuitState('TodoService', 'findById')).toBe(
      'CLOSED',
    );

    // findById still works
    expect(interceptor.intercept(ctxB)).toBe('ok');
  });
});
