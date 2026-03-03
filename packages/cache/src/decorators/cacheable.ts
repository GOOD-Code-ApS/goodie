/**
 * @Cacheable(cacheName) — cache the method's return value.
 *
 * No-op at runtime. The cache transformer plugin reads this decorator
 * at compile time and wires the CacheInterceptor with cache-get metadata.
 */
export function Cacheable(
  _cacheName: string,
  _opts?: { ttlMs?: number },
): (_target: unknown, _context: ClassMethodDecoratorContext) => void {
  return () => {};
}
