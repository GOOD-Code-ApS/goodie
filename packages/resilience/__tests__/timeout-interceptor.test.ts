import type { InvocationContext } from '@goodie-ts/aop';
import { describe, expect, it } from 'vitest';
import {
  TimeoutError,
  TimeoutInterceptor,
} from '../src/timeout-interceptor.js';

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

describe('TimeoutInterceptor', () => {
  it('should pass through when no metadata is present', () => {
    const interceptor = new TimeoutInterceptor();
    const ctx = createContext({ proceed: () => 'direct' });
    expect(interceptor.intercept(ctx)).toBe('direct');
  });

  it('should pass through sync methods without timeout', () => {
    const interceptor = new TimeoutInterceptor();

    const ctx = createContext({
      proceed: () => 'sync result',
      metadata: { duration: 100 },
    });

    // Sync methods can't be timed out — returned as-is
    expect(interceptor.intercept(ctx)).toBe('sync result');
  });

  it('should resolve async methods that complete within timeout', async () => {
    const interceptor = new TimeoutInterceptor();

    const ctx = createContext({
      proceed: () =>
        new Promise((resolve) => setTimeout(() => resolve('fast'), 10)),
      metadata: { duration: 200 },
    });

    const result = await interceptor.intercept(ctx);
    expect(result).toBe('fast');
  });

  it('should reject async methods that exceed timeout', async () => {
    const interceptor = new TimeoutInterceptor();

    const ctx = createContext({
      proceed: () =>
        new Promise((resolve) => setTimeout(() => resolve('slow'), 500)),
      metadata: { duration: 50 },
    });

    await expect(interceptor.intercept(ctx)).rejects.toThrow(TimeoutError);
    await expect(interceptor.intercept(ctx)).rejects.toThrow(
      'timed out after 50ms',
    );
  });

  it('should propagate errors from the original method', async () => {
    const interceptor = new TimeoutInterceptor();

    const ctx = createContext({
      proceed: () => Promise.reject(new Error('method error')),
      metadata: { duration: 1000 },
    });

    await expect(interceptor.intercept(ctx)).rejects.toThrow('method error');
  });
});
