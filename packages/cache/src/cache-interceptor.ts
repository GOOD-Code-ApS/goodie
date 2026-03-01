import type { InvocationContext, MethodInterceptor } from '@goodie-ts/aop';
import type { CacheManager } from './cache-manager.js';

/** Metadata shape expected from the cache transformer plugin. */
interface CacheMetadata {
  cacheName: string;
  cacheAction: 'get' | 'evict' | 'put';
  ttlMs?: number;
  allEntries?: boolean;
}

/**
 * AOP interceptor that handles @Cacheable, @CacheEvict, and @CachePut decorators.
 *
 * Reads cache configuration from `ctx.metadata` (set by the cache transformer plugin).
 * Cache keys are derived from stringifying the method arguments.
 */
export class CacheInterceptor implements MethodInterceptor {
  constructor(private readonly cacheManager: CacheManager) {}

  intercept(ctx: InvocationContext): unknown {
    const meta = ctx.metadata as CacheMetadata | undefined;
    if (!meta) return ctx.proceed();

    const cacheKey = this.buildKey(ctx.methodName, ctx.args);

    switch (meta.cacheAction) {
      case 'get':
        return this.handleCacheable(ctx, meta, cacheKey);
      case 'put':
        return this.handleCachePut(ctx, meta, cacheKey);
      case 'evict':
        return this.handleCacheEvict(ctx, meta, cacheKey);
      default:
        return ctx.proceed();
    }
  }

  private handleCacheable(
    ctx: InvocationContext,
    meta: CacheMetadata,
    cacheKey: string,
  ): unknown {
    const cached = this.cacheManager.get(meta.cacheName, cacheKey);
    if (cached !== undefined) return cached;

    const result = ctx.proceed();

    if (result instanceof Promise) {
      return result.then((value) => {
        if (value !== undefined && value !== null) {
          this.cacheManager.put(meta.cacheName, cacheKey, value, meta.ttlMs);
        }
        return value;
      });
    }

    if (result !== undefined && result !== null) {
      this.cacheManager.put(meta.cacheName, cacheKey, result, meta.ttlMs);
    }
    return result;
  }

  private handleCachePut(
    ctx: InvocationContext,
    meta: CacheMetadata,
    cacheKey: string,
  ): unknown {
    const result = ctx.proceed();

    if (result instanceof Promise) {
      return result.then((value) => {
        this.cacheManager.put(meta.cacheName, cacheKey, value, meta.ttlMs);
        return value;
      });
    }

    this.cacheManager.put(meta.cacheName, cacheKey, result, meta.ttlMs);
    return result;
  }

  private handleCacheEvict(
    ctx: InvocationContext,
    meta: CacheMetadata,
    cacheKey: string,
  ): unknown {
    const result = ctx.proceed();

    const doEvict = () => {
      if (meta.allEntries) {
        this.cacheManager.evictAll(meta.cacheName);
      } else {
        this.cacheManager.evict(meta.cacheName, cacheKey);
      }
    };

    if (result instanceof Promise) {
      return result.then((value) => {
        doEvict();
        return value;
      });
    }

    doEvict();
    return result;
  }

  private buildKey(methodName: string, args: unknown[]): string {
    if (args.length === 0) return methodName;
    return `${methodName}:${args.map((a) => this.stringifyArg(a)).join(',')}`;
  }

  private stringifyArg(arg: unknown): string {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    const type = typeof arg;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return String(arg);
    }
    try {
      return JSON.stringify(arg);
    } catch {
      throw new Error(
        `Cache key generation failed: argument of type ${type} is not serializable. ` +
          'Use primitive arguments or provide a custom key strategy.',
      );
    }
  }
}
