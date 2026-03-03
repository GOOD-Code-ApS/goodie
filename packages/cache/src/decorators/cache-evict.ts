/**
 * @CacheEvict(cacheName, opts?) — evict cache entries after method execution.
 *
 * No-op at runtime. The cache transformer plugin reads this decorator
 * at compile time and wires the CacheInterceptor with cache-evict metadata.
 *
 * @param cacheName - Name of the cache to evict from.
 * @param opts - Optional settings.
 * @param opts.allEntries - If true, evicts all entries in the cache instead of a single key.
 */
export function CacheEvict(
  _cacheName: string,
  _opts?: { allEntries?: boolean },
): (_target: unknown, _context: ClassMethodDecoratorContext) => void {
  return () => {};
}
