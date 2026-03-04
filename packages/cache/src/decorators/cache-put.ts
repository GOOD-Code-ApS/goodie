import { createAopDecorator } from '@goodie-ts/aop';
import type { CacheInterceptor } from '../cache-interceptor.js';

/**
 * @CachePut(cacheName) — always execute the method and update the cache.
 *
 * No-op at runtime. The AOP scanner reads the type parameter
 * at compile time and wires the CacheInterceptor with cache-put metadata.
 */
export const CachePut = createAopDecorator<{
  interceptor: CacheInterceptor;
  order: -50;
  metadata: { cacheAction: 'put' };
  argMapping: ['cacheName'];
  args: [cacheName: string, opts?: { ttlMs?: number }];
}>();
