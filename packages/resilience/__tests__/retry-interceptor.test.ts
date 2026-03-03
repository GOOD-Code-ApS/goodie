import type { InvocationContext } from '@goodie-ts/aop';
import { describe, expect, it } from 'vitest';
import { RetryInterceptor } from '../src/retry-interceptor.js';

function createContext(
  overrides?: Partial<InvocationContext>,
): InvocationContext {
  return {
    className: 'TodoService',
    methodName: 'findAll',
    args: [],
    target: {},
    proceed: () => [{ id: 1 }],
    ...overrides,
  };
}

describe('RetryInterceptor', () => {
  it('should pass through when no metadata is present', () => {
    const interceptor = new RetryInterceptor();
    const ctx = createContext({ proceed: () => 'direct' });
    expect(interceptor.intercept(ctx)).toBe('direct');
  });

  it('should return result on first success without retrying', () => {
    const interceptor = new RetryInterceptor();
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        return 'ok';
      },
      metadata: { maxAttempts: 3, delay: 0, multiplier: 1 },
    });

    expect(interceptor.intercept(ctx)).toBe('ok');
    expect(callCount).toBe(1);
  });

  it('should retry on sync failure and succeed', async () => {
    const interceptor = new RetryInterceptor();
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        if (callCount < 3) throw new Error('fail');
        return 'recovered';
      },
      metadata: { maxAttempts: 3, delay: 0, multiplier: 1 },
    });

    const result = await interceptor.intercept(ctx);
    expect(result).toBe('recovered');
    expect(callCount).toBe(3);
  });

  it('should throw after exhausting max attempts (sync)', async () => {
    const interceptor = new RetryInterceptor();
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        throw new Error('always fails');
      },
      metadata: { maxAttempts: 2, delay: 0, multiplier: 1 },
    });

    await expect(interceptor.intercept(ctx)).rejects.toThrow('always fails');
    expect(callCount).toBe(2);
  });

  it('should retry on async failure and succeed', async () => {
    const interceptor = new RetryInterceptor();
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        if (callCount < 2) return Promise.reject(new Error('async fail'));
        return Promise.resolve('async recovered');
      },
      metadata: { maxAttempts: 3, delay: 0, multiplier: 1 },
    });

    const result = await interceptor.intercept(ctx);
    expect(result).toBe('async recovered');
    expect(callCount).toBe(2);
  });

  it('should throw after exhausting max attempts (async)', async () => {
    const interceptor = new RetryInterceptor();
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        return Promise.reject(new Error('persistent failure'));
      },
      metadata: { maxAttempts: 2, delay: 0, multiplier: 1 },
    });

    await expect(interceptor.intercept(ctx)).rejects.toThrow(
      'persistent failure',
    );
    expect(callCount).toBe(2);
  });

  it('should apply exponential backoff delay with jitter', async () => {
    const interceptor = new RetryInterceptor();
    let callCount = 0;
    const timestamps: number[] = [];

    const ctx = createContext({
      proceed: () => {
        callCount++;
        timestamps.push(Date.now());
        if (callCount < 3) throw new Error('fail');
        return 'done';
      },
      metadata: { maxAttempts: 3, delay: 100, multiplier: 2 },
    });

    const result = await interceptor.intercept(ctx);
    expect(result).toBe('done');
    expect(callCount).toBe(3);

    // First retry delay: base 100ms * 2^0 = 100ms, with jitter [50, 100]
    // Second retry delay: base 100ms * 2^1 = 200ms, with jitter [100, 200]
    // Allow extra tolerance for timer imprecision
    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];
    expect(delay1).toBeGreaterThanOrEqual(35); // 50ms jitter min - tolerance
    expect(delay1).toBeLessThanOrEqual(150); // 100ms jitter max + tolerance
    expect(delay2).toBeGreaterThanOrEqual(75); // 100ms jitter min - tolerance
    expect(delay2).toBeLessThanOrEqual(260); // 200ms jitter max + tolerance
  });
});
