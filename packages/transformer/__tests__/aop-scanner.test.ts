import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { scanAopDecoratorDefinitions } from '../src/aop-scanner.js';

/** Stub types for in-memory test projects. */
const AOP_STUBS = `
export interface InvocationContext {
  className: string;
  methodName: string;
  args: unknown[];
  target: unknown;
  proceed(...args: unknown[]): unknown;
  metadata?: Record<string, unknown>;
}

export interface MethodInterceptor {
  intercept(ctx: InvocationContext): unknown;
}

export interface AopDecoratorConfig {
  interceptor: MethodInterceptor;
  order: number;
  metadata?: Record<string, unknown>;
  argMapping?: readonly string[];
  defaults?: Record<string, unknown>;
  args?: readonly unknown[];
}

type MethodDec = (target: any, context: ClassMethodDecoratorContext) => void;
type ExtractArgs<T> = T extends { args: readonly [...infer A] } ? A : [];

export function createAopDecorator<
  TConfig extends AopDecoratorConfig,
>(): (...args: ExtractArgs<TConfig>) => MethodDec {
  return () => (_target, _context) => {};
}
`;

function createProject(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile('/src/aop.ts', AOP_STUBS);
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

describe('scanAopDecoratorDefinitions', () => {
  it('should extract interceptor class and order from a simple decorator', () => {
    const project = createProject({
      '/src/interceptor.ts': `
        import type { MethodInterceptor, InvocationContext } from './aop.js'
        export class LoggingInterceptor implements MethodInterceptor {
          intercept(ctx: InvocationContext) { return ctx.proceed(); }
        }
      `,
      '/src/log.ts': `
        import { createAopDecorator } from './aop.js'
        import type { LoggingInterceptor } from './interceptor.js'
        export const Log = createAopDecorator<{
          interceptor: LoggingInterceptor;
          order: -100;
        }>();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);

    expect(results).toHaveLength(1);
    expect(results[0].decoratorName).toBe('Log');
    expect(results[0].interceptorClassName).toBe('LoggingInterceptor');
    expect(results[0].interceptorImportPath).toContain('/src/interceptor.ts');
    expect(results[0].order).toBe(-100);
    expect(results[0].metadata).toBeUndefined();
    expect(results[0].argMapping).toBeUndefined();
    expect(results[0].defaults).toBeUndefined();
  });

  it('should extract negative order correctly', () => {
    const project = createProject({
      '/src/interceptor.ts': `
        import type { MethodInterceptor, InvocationContext } from './aop.js'
        export class RetryInterceptor implements MethodInterceptor {
          intercept(ctx: InvocationContext) { return ctx.proceed(); }
        }
      `,
      '/src/retryable.ts': `
        import { createAopDecorator } from './aop.js'
        import type { RetryInterceptor } from './interceptor.js'
        export const Retryable = createAopDecorator<{
          interceptor: RetryInterceptor;
          order: -10;
        }>();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);

    expect(results).toHaveLength(1);
    expect(results[0].order).toBe(-10);
  });

  it('should extract metadata from object type', () => {
    const project = createProject({
      '/src/interceptor.ts': `
        import type { MethodInterceptor, InvocationContext } from './aop.js'
        export class CacheInterceptor implements MethodInterceptor {
          intercept(ctx: InvocationContext) { return ctx.proceed(); }
        }
      `,
      '/src/cacheable.ts': `
        import { createAopDecorator } from './aop.js'
        import type { CacheInterceptor } from './interceptor.js'
        export const Cacheable = createAopDecorator<{
          interceptor: CacheInterceptor;
          order: -50;
          metadata: { cacheAction: 'get' };
        }>();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);

    expect(results).toHaveLength(1);
    expect(results[0].metadata).toEqual({ cacheAction: 'get' });
  });

  it('should extract argMapping from tuple type', () => {
    const project = createProject({
      '/src/interceptor.ts': `
        import type { MethodInterceptor, InvocationContext } from './aop.js'
        export class CacheInterceptor implements MethodInterceptor {
          intercept(ctx: InvocationContext) { return ctx.proceed(); }
        }
      `,
      '/src/cacheable.ts': `
        import { createAopDecorator } from './aop.js'
        import type { CacheInterceptor } from './interceptor.js'
        export const Cacheable = createAopDecorator<{
          interceptor: CacheInterceptor;
          order: -50;
          argMapping: ['cacheName'];
        }>();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);

    expect(results).toHaveLength(1);
    expect(results[0].argMapping).toEqual(['cacheName']);
  });

  it('should extract defaults from object type', () => {
    const project = createProject({
      '/src/interceptor.ts': `
        import type { MethodInterceptor, InvocationContext } from './aop.js'
        export class RetryInterceptor implements MethodInterceptor {
          intercept(ctx: InvocationContext) { return ctx.proceed(); }
        }
      `,
      '/src/retryable.ts': `
        import { createAopDecorator } from './aop.js'
        import type { RetryInterceptor } from './interceptor.js'
        export const Retryable = createAopDecorator<{
          interceptor: RetryInterceptor;
          order: -10;
          defaults: { maxAttempts: 3; delay: 1000; multiplier: 1 };
        }>();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);

    expect(results).toHaveLength(1);
    expect(results[0].defaults).toEqual({
      maxAttempts: 3,
      delay: 1000,
      multiplier: 1,
    });
  });

  it('should ignore the args field', () => {
    const project = createProject({
      '/src/interceptor.ts': `
        import type { MethodInterceptor, InvocationContext } from './aop.js'
        export class LoggingInterceptor implements MethodInterceptor {
          intercept(ctx: InvocationContext) { return ctx.proceed(); }
        }
      `,
      '/src/log.ts': `
        import { createAopDecorator } from './aop.js'
        import type { LoggingInterceptor } from './interceptor.js'

        interface LogOptions { level?: 'debug' | 'info'; }

        export const Log = createAopDecorator<{
          interceptor: LoggingInterceptor;
          order: -100;
          args: [opts?: LogOptions];
        }>();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);

    expect(results).toHaveLength(1);
    expect(results[0].decoratorName).toBe('Log');
    // args should not appear in the scanned result
    expect(results[0]).not.toHaveProperty('args');
  });

  it('should scan multiple decorators from one file', () => {
    const project = createProject({
      '/src/interceptor.ts': `
        import type { MethodInterceptor, InvocationContext } from './aop.js'
        export class CacheInterceptor implements MethodInterceptor {
          intercept(ctx: InvocationContext) { return ctx.proceed(); }
        }
      `,
      '/src/cache-decorators.ts': `
        import { createAopDecorator } from './aop.js'
        import type { CacheInterceptor } from './interceptor.js'

        export const Cacheable = createAopDecorator<{
          interceptor: CacheInterceptor;
          order: -50;
          metadata: { cacheAction: 'get' };
          argMapping: ['cacheName'];
        }>();

        export const CacheEvict = createAopDecorator<{
          interceptor: CacheInterceptor;
          order: -50;
          metadata: { cacheAction: 'evict' };
          argMapping: ['cacheName'];
        }>();

        export const CachePut = createAopDecorator<{
          interceptor: CacheInterceptor;
          order: -50;
          metadata: { cacheAction: 'put' };
          argMapping: ['cacheName'];
        }>();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);

    expect(results).toHaveLength(3);
    const names = results.map((r) => r.decoratorName).sort();
    expect(names).toEqual(['CacheEvict', 'CachePut', 'Cacheable']);

    for (const r of results) {
      expect(r.interceptorClassName).toBe('CacheInterceptor');
      expect(r.order).toBe(-50);
    }

    expect(
      results.find((r) => r.decoratorName === 'Cacheable')!.metadata,
    ).toEqual({
      cacheAction: 'get',
    });
    expect(
      results.find((r) => r.decoratorName === 'CacheEvict')!.metadata,
    ).toEqual({
      cacheAction: 'evict',
    });
  });

  it('should return empty array when no createAopDecorator calls exist', () => {
    const project = createProject({
      '/src/service.ts': `
        export class MyService {
          doWork() {}
        }
      `,
    });

    const results = scanAopDecoratorDefinitions(project);
    expect(results).toEqual([]);
  });

  it('should skip calls without type arguments', () => {
    const project = createProject({
      '/src/broken.ts': `
        import { createAopDecorator } from './aop.js'
        // No type argument — should be skipped
        export const Broken = (createAopDecorator as any)();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);
    expect(results).toEqual([]);
  });

  it('should extract a full config with all optional fields', () => {
    const project = createProject({
      '/src/interceptor.ts': `
        import type { MethodInterceptor, InvocationContext } from './aop.js'
        export class TimeoutInterceptor implements MethodInterceptor {
          intercept(ctx: InvocationContext) { return ctx.proceed(); }
        }
      `,
      '/src/timeout.ts': `
        import { createAopDecorator } from './aop.js'
        import type { TimeoutInterceptor } from './interceptor.js'
        export const Timeout = createAopDecorator<{
          interceptor: TimeoutInterceptor;
          order: -30;
          argMapping: ['duration'];
          defaults: { duration: 5000 };
          args: [duration: number];
        }>();
      `,
    });

    const results = scanAopDecoratorDefinitions(project);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      decoratorName: 'Timeout',
      interceptorClassName: 'TimeoutInterceptor',
      interceptorImportPath: expect.stringContaining('/src/interceptor.ts'),
      order: -30,
      argMapping: ['duration'],
      defaults: { duration: 5000 },
    });
  });
});
