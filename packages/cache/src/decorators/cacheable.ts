import { createAopDecorator } from '@goodie-ts/aop';
import type { CacheInterceptor } from '../cache-interceptor.js';

/**
 * @Cacheable(cacheName) — cache the method's return value.
 *
 * No-op at runtime. The AOP scanner reads the type parameter
 * at compile time and wires the CacheInterceptor with cache-get metadata.
 */
export const Cacheable = createAopDecorator<{
  interceptor: CacheInterceptor;
  order: -50;
  metadata: { cacheAction: 'get' };
  argMapping: ['cacheName'];
  args: [cacheName: string, opts?: { ttlMs?: number }];
}>();
