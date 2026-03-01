/**
 * @CacheEvict(cacheName) — evict the cache entry after method execution.
 *
 * No-op at runtime. The cache transformer plugin reads this decorator
 * at compile time and wires the CacheInterceptor with cache-evict metadata.
 */
export function CacheEvict(
  _cacheName: string,
): (_target: unknown, _context: ClassMethodDecoratorContext) => void {
  return () => {};
}
