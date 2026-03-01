import type { BeanDefinition } from '@goodie-ts/core';
import { InjectionToken } from '@goodie-ts/core';
import { describe, expect, it } from 'vitest';
import { AopPostProcessor } from '../src/aop-post-processor.js';
import type { InvocationContext, MethodInterceptor } from '../src/types.js';

describe('AopPostProcessor', () => {
  function makeDefinition(metadata: Record<string, unknown>): BeanDefinition {
    const token = new InjectionToken('test');
    return {
      token,
      scope: 'singleton',
      dependencies: [],
      factory: () => null,
      eager: false,
      metadata,
    };
  }

  it('wraps methods listed in metadata.interceptedMethods', () => {
    const log: string[] = [];
    const interceptor: MethodInterceptor = {
      intercept(ctx: InvocationContext) {
        log.push('intercepted');
        return ctx.proceed();
      },
    };

    const processor = new AopPostProcessor(() => interceptor);

    const bean = {
      doWork() {
        log.push('doWork');
        return 'result';
      },
    };

    const def = makeDefinition({
      interceptedMethods: [
        {
          methodName: 'doWork',
          interceptorTokenRefs: [
            { className: 'TimingInterceptor', importPath: '' },
          ],
          order: 0,
        },
      ],
    });

    const result = processor.afterInit(bean, def);
    expect(result).toBe(bean);

    const returnValue = (result as typeof bean).doWork();
    expect(returnValue).toBe('result');
    expect(log).toEqual(['intercepted', 'doWork']);
  });

  it('skips beans without interceptedMethods metadata', () => {
    const processor = new AopPostProcessor(() => {
      throw new Error('should not be called');
    });

    const bean = {
      doWork() {
        return 'ok';
      },
    };
    const def = makeDefinition({});

    const result = processor.afterInit(bean, def);
    expect(result).toBe(bean);
    expect((result as typeof bean).doWork()).toBe('ok');
  });

  it('preserves this binding on intercepted methods', () => {
    const interceptor: MethodInterceptor = {
      intercept(ctx: InvocationContext) {
        return ctx.proceed();
      },
    };

    const processor = new AopPostProcessor(() => interceptor);

    const bean = {
      value: 42,
      getValue() {
        return this.value;
      },
    };

    const def = makeDefinition({
      interceptedMethods: [
        {
          methodName: 'getValue',
          interceptorTokenRefs: [{ className: 'Interceptor', importPath: '' }],
          order: 0,
        },
      ],
    });

    const result = processor.afterInit(bean, def) as typeof bean;
    expect(result.getValue()).toBe(42);
  });

  it('non-intercepted methods are not affected', () => {
    const interceptor: MethodInterceptor = {
      intercept(ctx: InvocationContext) {
        return ctx.proceed();
      },
    };

    const processor = new AopPostProcessor(() => interceptor);

    const originalOther = () => 'other';
    const bean = {
      doWork() {
        return 'work';
      },
      other: originalOther,
    };

    const def = makeDefinition({
      interceptedMethods: [
        {
          methodName: 'doWork',
          interceptorTokenRefs: [{ className: 'Interceptor', importPath: '' }],
          order: 0,
        },
      ],
    });

    const result = processor.afterInit(bean, def) as typeof bean;
    // other method should be exactly the same function reference
    expect(result.other).toBe(originalOther);
  });
});
