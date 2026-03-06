import type { InvocationContext } from '@goodie-ts/core';
import { describe, expect, it, vi } from 'vitest';
import { CacheInterceptor } from '../src/cache-interceptor.js';
import { CacheManager } from '../src/cache-manager.js';

function createContext(
  overrides?: Partial<InvocationContext>,
): InvocationContext {
  return {
    className: 'TodoService',
    methodName: 'findAll',
    args: [],
    target: {},
    proceed: () => [{ id: 1, title: 'Test' }],
    ...overrides,
  };
}

describe('CacheInterceptor', () => {
  it('should cache the result on @Cacheable (get)', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        return [{ id: 1 }];
      },
      metadata: { cacheName: 'todos', cacheAction: 'get' },
    });

    const result1 = interceptor.intercept(ctx);
    const result2 = interceptor.intercept(ctx);

    expect(result1).toEqual([{ id: 1 }]);
    expect(result2).toEqual([{ id: 1 }]);
    expect(callCount).toBe(1); // Only called once — second was cached
  });

  it('should cache async results on @Cacheable', async () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        return Promise.resolve([{ id: 1 }]);
      },
      metadata: { cacheName: 'todos', cacheAction: 'get' },
    });

    const result1 = await interceptor.intercept(ctx);
    const result2 = interceptor.intercept(ctx); // Should return cached (sync)

    expect(result1).toEqual([{ id: 1 }]);
    expect(result2).toEqual([{ id: 1 }]);
    expect(callCount).toBe(1);
  });

  it('should evict cache entry on @CacheEvict', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);

    // Pre-populate cache (key format: className#methodName)
    manager.put('todos', 'TodoService#findAll', [{ id: 1 }]);

    const ctx = createContext({
      proceed: () => undefined,
      metadata: { cacheName: 'todos', cacheAction: 'evict' },
    });

    interceptor.intercept(ctx);

    expect(manager.get('todos', 'TodoService#findAll')).toBeUndefined();
  });

  it('should always execute and update cache on @CachePut', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        return [{ id: callCount }];
      },
      metadata: { cacheName: 'todos', cacheAction: 'put' },
    });

    interceptor.intercept(ctx);
    interceptor.intercept(ctx);

    expect(callCount).toBe(2); // Always executes
    expect(manager.get('todos', 'TodoService#findAll')).toEqual([{ id: 2 }]); // Updated with latest
  });

  it('should use method args in cache key', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);

    const ctx1 = createContext({
      methodName: 'findById',
      args: ['id-1'],
      proceed: () => ({ id: 'id-1', title: 'First' }),
      metadata: { cacheName: 'todos', cacheAction: 'get' },
    });

    const ctx2 = createContext({
      methodName: 'findById',
      args: ['id-2'],
      proceed: () => ({ id: 'id-2', title: 'Second' }),
      metadata: { cacheName: 'todos', cacheAction: 'get' },
    });

    interceptor.intercept(ctx1);
    interceptor.intercept(ctx2);

    expect(manager.get('todos', 'TodoService#findById:"id-1"')).toEqual({
      id: 'id-1',
      title: 'First',
    });
    expect(manager.get('todos', 'TodoService#findById:"id-2"')).toEqual({
      id: 'id-2',
      title: 'Second',
    });
  });

  it('should pass through when no metadata is present', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);

    const ctx = createContext({
      proceed: () => 'direct',
    });

    expect(interceptor.intercept(ctx)).toBe('direct');
  });

  it('should evict all entries when allEntries is true', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);

    // Pre-populate cache with multiple entries
    manager.put('todos', 'findAll', [{ id: 1 }, { id: 2 }]);
    manager.put('todos', 'findById:1', { id: 1 });
    manager.put('todos', 'findById:2', { id: 2 });

    const ctx = createContext({
      methodName: 'create',
      proceed: () => ({ id: 3 }),
      metadata: { cacheName: 'todos', cacheAction: 'evict', allEntries: true },
    });

    interceptor.intercept(ctx);

    expect(manager.size('todos')).toBe(0);
  });

  it('should throw on non-serializable arguments', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const ctx = createContext({
      args: [circular],
      metadata: { cacheName: 'todos', cacheAction: 'get' },
    });

    expect(() => interceptor.intercept(ctx)).toThrow(
      'Cache key generation failed',
    );
  });

  it('should use JSON.stringify for all arg types in cache keys', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);

    const ctx = createContext({
      methodName: 'findById',
      args: [42],
      proceed: () => ({ id: 42 }),
      metadata: { cacheName: 'items', cacheAction: 'get' },
    });

    interceptor.intercept(ctx);

    // Number 42 via JSON.stringify is still "42"
    expect(manager.get('items', 'TodoService#findById:42')).toEqual({ id: 42 });
  });

  it('should not cache null/undefined results on @Cacheable', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);
    let callCount = 0;

    const ctx = createContext({
      proceed: () => {
        callCount++;
        return undefined;
      },
      metadata: { cacheName: 'todos', cacheAction: 'get' },
    });

    interceptor.intercept(ctx);
    interceptor.intercept(ctx);

    expect(callCount).toBe(2); // Called twice because undefined is not cached
  });

  it('should produce different keys for args containing commas or colons (no collision)', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);

    // These two calls used to produce the same key "get:a,b,c"
    const ctx1 = createContext({
      methodName: 'get',
      args: ['a,b', 'c'],
      proceed: () => 'result-1',
      metadata: { cacheName: 'test', cacheAction: 'get' },
    });

    const ctx2 = createContext({
      methodName: 'get',
      args: ['a', 'b,c'],
      proceed: () => 'result-2',
      metadata: { cacheName: 'test', cacheAction: 'get' },
    });

    interceptor.intercept(ctx1);
    interceptor.intercept(ctx2);

    // With JSON.stringify, the keys are now different:
    // "TodoService#get:\"a,b\",\"c\"" vs "TodoService#get:\"a\",\"b,c\""
    // So both results should be cached independently
    const key1 = 'TodoService#get:"a,b","c"';
    const key2 = 'TodoService#get:"a","b,c"';
    expect(manager.get('test', key1)).toBe('result-1');
    expect(manager.get('test', key2)).toBe('result-2');
  });

  it('should protect against async cache stampede (concurrent calls share same Promise)', async () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);
    let callCount = 0;

    let resolveDeferred!: (value: string) => void;
    const deferred = new Promise<string>((resolve) => {
      resolveDeferred = resolve;
    });

    const makeCtx = () =>
      createContext({
        methodName: 'expensiveOp',
        args: [],
        proceed: () => {
          callCount++;
          return deferred;
        },
        metadata: { cacheName: 'data', cacheAction: 'get' },
      });

    // Fire two concurrent requests before the first resolves
    const promise1 = interceptor.intercept(makeCtx()) as Promise<string>;
    const promise2 = interceptor.intercept(makeCtx()) as Promise<string>;

    // Both should return the same Promise reference
    expect(promise1).toBe(promise2);

    // Only one call should have been made to proceed()
    expect(callCount).toBe(1);

    // Resolve and verify both get the value
    resolveDeferred('shared-result');
    const [r1, r2] = await Promise.all([promise1, promise2]);
    expect(r1).toBe('shared-result');
    expect(r2).toBe('shared-result');
  });

  it('should clear in-flight entry on async rejection (stampede map cleanup)', async () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);
    let callCount = 0;

    const makeCtx = (fail: boolean) =>
      createContext({
        methodName: 'unstable',
        args: [],
        proceed: () => {
          callCount++;
          return fail
            ? Promise.reject(new Error('boom'))
            : Promise.resolve('ok');
        },
        metadata: { cacheName: 'data', cacheAction: 'get' },
      });

    // First call fails
    await expect(interceptor.intercept(makeCtx(true))).rejects.toThrow('boom');
    expect(callCount).toBe(1);

    // Second call should NOT reuse the failed in-flight promise — it should retry
    const result = await interceptor.intercept(makeCtx(false));
    expect(result).toBe('ok');
    expect(callCount).toBe(2);
  });

  it('should produce different cache keys for different classes with same method name', () => {
    const manager = new CacheManager();
    const interceptor = new CacheInterceptor(manager);

    const ctxA = createContext({
      className: 'ServiceA',
      methodName: 'findAll',
      args: [],
      proceed: () => 'from-A',
      metadata: { cacheName: 'shared', cacheAction: 'get' },
    });

    const ctxB = createContext({
      className: 'ServiceB',
      methodName: 'findAll',
      args: [],
      proceed: () => 'from-B',
      metadata: { cacheName: 'shared', cacheAction: 'get' },
    });

    interceptor.intercept(ctxA);
    interceptor.intercept(ctxB);

    expect(manager.get('shared', 'ServiceA#findAll')).toBe('from-A');
    expect(manager.get('shared', 'ServiceB#findAll')).toBe('from-B');
  });

  it('should swallow eviction errors and log them instead of propagating', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = new CacheManager();
    // Override evict to throw
    vi.spyOn(manager, 'evict').mockImplementation(() => {
      throw new Error('eviction failed');
    });
    const interceptor = new CacheInterceptor(manager);

    const ctx = createContext({
      methodName: 'remove',
      args: [1],
      proceed: () => 'business-result',
      metadata: { cacheName: 'items', cacheAction: 'evict' },
    });

    // Should not throw — eviction error is swallowed
    const result = interceptor.intercept(ctx);
    expect(result).toBe('business-result');

    // Error should be logged
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toContain('eviction failed');
    errorSpy.mockRestore();
  });

  it('should swallow async eviction errors and log them', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = new CacheManager();
    vi.spyOn(manager, 'evictAll').mockImplementation(() => {
      throw new Error('evictAll failed');
    });
    const interceptor = new CacheInterceptor(manager);

    const ctx = createContext({
      methodName: 'clearAll',
      args: [],
      proceed: () => Promise.resolve('async-result'),
      metadata: {
        cacheName: 'items',
        cacheAction: 'evict',
        allEntries: true,
      },
    });

    const result = await interceptor.intercept(ctx);
    expect(result).toBe('async-result');

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toContain('eviction failed');
    errorSpy.mockRestore();
  });
});
