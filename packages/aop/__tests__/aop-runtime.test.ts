import type { BeanDefinition } from '@goodie-ts/core';
import { ApplicationContext } from '@goodie-ts/core';
import { describe, expect, it } from 'vitest';
import { wrapAfterAdvice, wrapBeforeAdvice } from '../src/advice-wrappers.js';
import { buildInterceptorChain } from '../src/interceptor-chain.js';
import type {
  AfterAdvice,
  BeforeAdvice,
  InvocationContext,
  MethodInterceptor,
} from '../src/types.js';

/**
 * Runtime integration tests that simulate what generated code does:
 * construct beans, resolve interceptors via DI, and wire up interception.
 */
describe('AOP Runtime Integration', () => {
  it('@Around interceptor runs around the method', async () => {
    const log: string[] = [];

    class LoggingInterceptor implements MethodInterceptor {
      intercept(ctx: InvocationContext) {
        log.push('before');
        const result = ctx.proceed();
        log.push('after');
        return result;
      }
    }

    class MyService {
      doWork(x: number) {
        log.push('original');
        return x * 2;
      }
    }

    // Simulate generated code: interceptor is a dependency of MyService
    const definitions: BeanDefinition[] = [
      {
        token: LoggingInterceptor,
        scope: 'singleton',
        dependencies: [],
        factory: () => new LoggingInterceptor(),
        eager: false,
        metadata: {},
      },
      {
        token: MyService,
        scope: 'singleton',
        dependencies: [
          { token: LoggingInterceptor, optional: false, collection: false },
        ],
        factory: (__interceptor0: any) => {
          const instance = new MyService();
          instance.doWork = buildInterceptorChain(
            [__interceptor0],
            instance,
            'MyService',
            'doWork',
            instance.doWork.bind(instance),
          ) as any;
          return instance;
        },
        eager: false,
        metadata: {},
      },
    ];

    const ctx = await ApplicationContext.create(definitions);
    const service = ctx.get(MyService);
    const result = service.doWork(5);

    expect(result).toBe(10);
    expect(log).toEqual(['before', 'original', 'after']);
  });

  it('@Before advice runs before the method', async () => {
    const log: string[] = [];

    class LogAdvice implements BeforeAdvice {
      before() {
        log.push('before-advice');
      }
    }

    class MyService {
      doWork() {
        log.push('original');
        return 42;
      }
    }

    const definitions: BeanDefinition[] = [
      {
        token: LogAdvice,
        scope: 'singleton',
        dependencies: [],
        factory: () => new LogAdvice(),
        eager: false,
        metadata: {},
      },
      {
        token: MyService,
        scope: 'singleton',
        dependencies: [
          { token: LogAdvice, optional: false, collection: false },
        ],
        factory: (__interceptor0: any) => {
          const instance = new MyService();
          instance.doWork = buildInterceptorChain(
            [wrapBeforeAdvice(__interceptor0)],
            instance,
            'MyService',
            'doWork',
            instance.doWork.bind(instance),
          ) as any;
          return instance;
        },
        eager: false,
        metadata: {},
      },
    ];

    const ctx = await ApplicationContext.create(definitions);
    const service = ctx.get(MyService);
    const result = service.doWork();

    expect(result).toBe(42);
    expect(log).toEqual(['before-advice', 'original']);
  });

  it('@After advice runs after the method with result', async () => {
    const captured: unknown[] = [];

    class MetricsAdvice implements AfterAdvice {
      after(_ctx: any, result: unknown) {
        captured.push(result);
      }
    }

    class MyService {
      doWork() {
        return 42;
      }
    }

    const definitions: BeanDefinition[] = [
      {
        token: MetricsAdvice,
        scope: 'singleton',
        dependencies: [],
        factory: () => new MetricsAdvice(),
        eager: false,
        metadata: {},
      },
      {
        token: MyService,
        scope: 'singleton',
        dependencies: [
          { token: MetricsAdvice, optional: false, collection: false },
        ],
        factory: (__interceptor0: any) => {
          const instance = new MyService();
          instance.doWork = buildInterceptorChain(
            [wrapAfterAdvice(__interceptor0)],
            instance,
            'MyService',
            'doWork',
            instance.doWork.bind(instance),
          ) as any;
          return instance;
        },
        eager: false,
        metadata: {},
      },
    ];

    const ctx = await ApplicationContext.create(definitions);
    const service = ctx.get(MyService);
    const result = service.doWork();

    expect(result).toBe(42);
    expect(captured).toEqual([42]);
  });

  it('multiple interceptors chain in correct order', async () => {
    const log: string[] = [];

    class FirstInterceptor implements MethodInterceptor {
      intercept(ctx: InvocationContext) {
        log.push('first-before');
        const result = ctx.proceed();
        log.push('first-after');
        return result;
      }
    }

    class SecondInterceptor implements MethodInterceptor {
      intercept(ctx: InvocationContext) {
        log.push('second-before');
        const result = ctx.proceed();
        log.push('second-after');
        return result;
      }
    }

    class MyService {
      doWork() {
        log.push('original');
        return 42;
      }
    }

    const definitions: BeanDefinition[] = [
      {
        token: FirstInterceptor,
        scope: 'singleton',
        dependencies: [],
        factory: () => new FirstInterceptor(),
        eager: false,
        metadata: {},
      },
      {
        token: SecondInterceptor,
        scope: 'singleton',
        dependencies: [],
        factory: () => new SecondInterceptor(),
        eager: false,
        metadata: {},
      },
      {
        token: MyService,
        scope: 'singleton',
        dependencies: [
          { token: FirstInterceptor, optional: false, collection: false },
          { token: SecondInterceptor, optional: false, collection: false },
        ],
        factory: (__interceptor0: any, __interceptor1: any) => {
          const instance = new MyService();
          instance.doWork = buildInterceptorChain(
            [__interceptor0, __interceptor1],
            instance,
            'MyService',
            'doWork',
            instance.doWork.bind(instance),
          ) as any;
          return instance;
        },
        eager: false,
        metadata: {},
      },
    ];

    const ctx = await ApplicationContext.create(definitions);
    const service = ctx.get(MyService);
    const result = service.doWork();

    expect(result).toBe(42);
    expect(log).toEqual([
      'first-before',
      'second-before',
      'original',
      'second-after',
      'first-after',
    ]);
  });

  it('mixed advice types chain correctly', async () => {
    const log: string[] = [];

    class BeforeLog implements BeforeAdvice {
      before() {
        log.push('before');
      }
    }

    class AfterLog implements AfterAdvice {
      after() {
        log.push('after');
      }
    }

    class AroundLog implements MethodInterceptor {
      intercept(ctx: InvocationContext) {
        log.push('around-before');
        const result = ctx.proceed();
        log.push('around-after');
        return result;
      }
    }

    class MyService {
      doWork() {
        log.push('original');
        return 42;
      }
    }

    const definitions: BeanDefinition[] = [
      {
        token: BeforeLog,
        scope: 'singleton',
        dependencies: [],
        factory: () => new BeforeLog(),
        eager: false,
        metadata: {},
      },
      {
        token: AfterLog,
        scope: 'singleton',
        dependencies: [],
        factory: () => new AfterLog(),
        eager: false,
        metadata: {},
      },
      {
        token: AroundLog,
        scope: 'singleton',
        dependencies: [],
        factory: () => new AroundLog(),
        eager: false,
        metadata: {},
      },
      {
        token: MyService,
        scope: 'singleton',
        dependencies: [
          { token: BeforeLog, optional: false, collection: false },
          { token: AfterLog, optional: false, collection: false },
          { token: AroundLog, optional: false, collection: false },
        ],
        // Simulates: @Before(BeforeLog) @After(AfterLog) @Around(AroundLog) doWork()
        factory: (
          __interceptor0: any,
          __interceptor1: any,
          __interceptor2: any,
        ) => {
          const instance = new MyService();
          instance.doWork = buildInterceptorChain(
            [
              wrapBeforeAdvice(__interceptor0),
              wrapAfterAdvice(__interceptor1),
              __interceptor2,
            ],
            instance,
            'MyService',
            'doWork',
            instance.doWork.bind(instance),
          ) as any;
          return instance;
        },
        eager: false,
        metadata: {},
      },
    ];

    const ctx = await ApplicationContext.create(definitions);
    const service = ctx.get(MyService);
    const result = service.doWork();

    expect(result).toBe(42);
    // Before runs first, then After wraps around AroundLog, which wraps original
    expect(log).toEqual([
      'before',
      'around-before',
      'original',
      'around-after',
      'after',
    ]);
  });
});
