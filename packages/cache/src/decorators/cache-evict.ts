import { createAopDecorator } from '@goodie-ts/core';
import type { CacheInterceptor } from '../cache-interceptor.js';

/**
 * @CacheEvict(cacheName, opts?) — evict cache entries after method execution.
 *
 * No-op at runtime. The AOP scanner reads the type parameter
 * at compile time and wires the CacheInterceptor with cache-evict metadata.
 *
 * @param cacheName - Name of the cache to evict from.
 * @param opts - Optional settings.
 * @param opts.allEntries - If true, evicts all entries in the cache instead of a single key.
 */
export const CacheEvict = createAopDecorator<{
  interceptor: CacheInterceptor;
  order: -50;
  metadata: { cacheAction: 'evict' };
  argMapping: ['cacheName'];
  args: [cacheName: string, opts?: { allEntries?: boolean }];
}>();
