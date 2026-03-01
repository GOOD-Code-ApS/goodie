import { describe, expect, it } from 'vitest';
import { buildInterceptorChain } from '../src/interceptor-chain.js';
import type { InvocationContext, MethodInterceptor } from '../src/types.js';

describe('InterceptorChain', () => {
  it('single interceptor wraps method', () => {
    const log: string[] = [];
    const interceptor: MethodInterceptor = {
      intercept(ctx: InvocationContext) {
        log.push('before');
        const result = ctx.proceed();
        log.push('after');
        return result;
      },
    };

    const original = (x: unknown) => (x as number) * 2;
    const chain = buildInterceptorChain(
      [interceptor],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );
    const result = chain(5);

    expect(result).toBe(10);
    expect(log).toEqual(['before', 'after']);
  });

  it('multiple interceptors chain in order', () => {
    const log: string[] = [];

    const first: MethodInterceptor = {
      intercept(ctx: InvocationContext) {
        log.push('first-before');
        const result = ctx.proceed();
        log.push('first-after');
        return result;
      },
    };

    const second: MethodInterceptor = {
      intercept(ctx: InvocationContext) {
        log.push('second-before');
        const result = ctx.proceed();
        log.push('second-after');
        return result;
      },
    };

    const original = () => {
      log.push('original');
      return 42;
    };

    const chain = buildInterceptorChain(
      [first, second],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );
    const result = chain();

    expect(result).toBe(42);
    expect(log).toEqual([
      'first-before',
      'second-before',
      'original',
      'second-after',
      'first-after',
    ]);
  });

  it('interceptor can modify args before proceed', () => {
    const interceptor: MethodInterceptor = {
      intercept(ctx: InvocationContext) {
        return ctx.proceed((ctx.args[0] as number) + 10);
      },
    };

    const original = (x: unknown) => (x as number) * 2;
    const chain = buildInterceptorChain(
      [interceptor],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    expect(chain(5)).toBe(30); // (5 + 10) * 2
  });

  it('interceptor can modify return value after proceed', () => {
    const interceptor: MethodInterceptor = {
      intercept(ctx: InvocationContext) {
        const result = ctx.proceed() as number;
        return result + 100;
      },
    };

    const original = (x: unknown) => (x as number) * 2;
    const chain = buildInterceptorChain(
      [interceptor],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    expect(chain(5)).toBe(110); // 5 * 2 + 100
  });

  it('interceptor can short-circuit (not call proceed)', () => {
    const log: string[] = [];
    const interceptor: MethodInterceptor = {
      intercept(_ctx: InvocationContext) {
        log.push('interceptor');
        return 'short-circuited';
      },
    };

    const original = () => {
      log.push('original');
      return 'original-result';
    };

    const chain = buildInterceptorChain(
      [interceptor],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    expect(chain()).toBe('short-circuited');
    expect(log).toEqual(['interceptor']);
  });

  it('empty chain calls original directly', () => {
    const log: string[] = [];
    const original = () => {
      log.push('original');
      return 42;
    };

    const chain = buildInterceptorChain(
      [],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    expect(chain()).toBe(42);
    expect(log).toEqual(['original']);
  });

  it('async interceptors work correctly', async () => {
    const log: string[] = [];
    const interceptor: MethodInterceptor = {
      async intercept(ctx: InvocationContext) {
        log.push('before');
        const result = await ctx.proceed();
        log.push('after');
        return result;
      },
    };

    const original = async () => {
      log.push('original');
      return 42;
    };

    const chain = buildInterceptorChain(
      [interceptor],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    const result = await chain();
    expect(result).toBe(42);
    expect(log).toEqual(['before', 'original', 'after']);
  });
});
