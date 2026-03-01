import { describe, expect, it } from 'vitest';
import { wrapAfterAdvice, wrapBeforeAdvice } from '../src/advice-wrappers.js';
import { buildInterceptorChain } from '../src/interceptor-chain.js';
import type { AfterAdvice, BeforeAdvice } from '../src/types.js';

describe('wrapBeforeAdvice', () => {
  it('runs before advice then proceeds', () => {
    const log: string[] = [];
    const advice: BeforeAdvice = {
      before(ctx) {
        log.push(`before:${ctx.methodName}:${JSON.stringify(ctx.args)}`);
      },
    };

    const wrapped = wrapBeforeAdvice(advice);
    const original = (x: unknown) => {
      log.push('original');
      return (x as number) * 2;
    };

    const chain = buildInterceptorChain(
      [wrapped],
      {},
      'Test',
      'doWork',
      original as (...args: unknown[]) => unknown,
    );

    const result = chain(5);
    expect(result).toBe(10);
    expect(log).toEqual(['before:doWork:[5]', 'original']);
  });

  it('handles async before advice', async () => {
    const log: string[] = [];
    const advice: BeforeAdvice = {
      async before() {
        log.push('async-before');
      },
    };

    const wrapped = wrapBeforeAdvice(advice);
    const original = () => {
      log.push('original');
      return 42;
    };

    const chain = buildInterceptorChain(
      [wrapped],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    const result = await chain();
    expect(result).toBe(42);
    expect(log).toEqual(['async-before', 'original']);
  });
});

describe('wrapAfterAdvice', () => {
  it('runs after advice with the method result', () => {
    const log: string[] = [];
    const advice: AfterAdvice = {
      after(ctx, result) {
        log.push(`after:${ctx.methodName}:${result}`);
      },
    };

    const wrapped = wrapAfterAdvice(advice);
    const original = (x: unknown) => {
      log.push('original');
      return (x as number) * 2;
    };

    const chain = buildInterceptorChain(
      [wrapped],
      {},
      'Test',
      'doWork',
      original as (...args: unknown[]) => unknown,
    );

    const result = chain(5);
    expect(result).toBe(10);
    expect(log).toEqual(['original', 'after:doWork:10']);
  });

  it('preserves original return value (after advice cannot modify it)', () => {
    const advice: AfterAdvice = {
      after() {
        // intentionally does not return anything meaningful
      },
    };

    const wrapped = wrapAfterAdvice(advice);
    const original = () => 42;

    const chain = buildInterceptorChain(
      [wrapped],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    expect(chain()).toBe(42);
  });

  it('handles async original method', async () => {
    const log: string[] = [];
    const advice: AfterAdvice = {
      after(_ctx, result) {
        log.push(`after:${result}`);
      },
    };

    const wrapped = wrapAfterAdvice(advice);
    const original = async () => {
      log.push('original');
      return 42;
    };

    const chain = buildInterceptorChain(
      [wrapped],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    const result = await chain();
    expect(result).toBe(42);
    expect(log).toEqual(['original', 'after:42']);
  });

  it('handles async after advice with sync original', async () => {
    const log: string[] = [];
    const advice: AfterAdvice = {
      async after(_ctx, result) {
        log.push(`async-after:${result}`);
      },
    };

    const wrapped = wrapAfterAdvice(advice);
    const original = () => {
      log.push('original');
      return 42;
    };

    const chain = buildInterceptorChain(
      [wrapped],
      {},
      'Test',
      'method',
      original as (...args: unknown[]) => unknown,
    );

    const result = await chain();
    expect(result).toBe(42);
    expect(log).toEqual(['original', 'async-after:42']);
  });
});
