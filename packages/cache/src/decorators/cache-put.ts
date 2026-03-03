/**
 * @CachePut(cacheName) — always execute the method and update the cache.
 *
 * No-op at runtime. The cache transformer plugin reads this decorator
 * at compile time and wires the CacheInterceptor with cache-put metadata.
 */
export function CachePut(
  _cacheName: string,
  _opts?: { ttlMs?: number },
): (_target: unknown, _context: ClassMethodDecoratorContext) => void {
  return () => {};
}
