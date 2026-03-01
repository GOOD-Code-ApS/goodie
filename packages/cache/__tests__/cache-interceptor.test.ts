import type { InvocationContext } from '@goodie-ts/aop';
import { describe, expect, it } from 'vitest';
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

    // Pre-populate cache
    manager.put('todos', 'findAll', [{ id: 1 }]);

    const ctx = createContext({
      proceed: () => undefined,
      metadata: { cacheName: 'todos', cacheAction: 'evict' },
    });

    interceptor.intercept(ctx);

    expect(manager.get('todos', 'findAll')).toBeUndefined();
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
    expect(manager.get('todos', 'findAll')).toEqual([{ id: 2 }]); // Updated with latest
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

    expect(manager.get('todos', 'findById:"id-1"')).toEqual({
      id: 'id-1',
      title: 'First',
    });
    expect(manager.get('todos', 'findById:"id-2"')).toEqual({
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
});
