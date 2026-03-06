import { Singleton } from '@goodie-ts/core';

/** Entry stored in a cache with optional TTL. */
interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number | undefined;
}

/**
 * In-memory cache manager with named caches and TTL support.
 *
 * Each cache is a separate namespace identified by a string name.
 * Entries expire after their TTL (time-to-live) in milliseconds.
 */
@Singleton()
export class CacheManager {
  private readonly caches = new Map<string, Map<string, CacheEntry>>();

  get<T = unknown>(cacheName: string, key: string): T | undefined {
    const cache = this.caches.get(cacheName);
    if (!cache) return undefined;

    const entry = cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  put(cacheName: string, key: string, value: unknown, ttlMs?: number): void {
    let cache = this.caches.get(cacheName);
    if (!cache) {
      cache = new Map();
      this.caches.set(cacheName, cache);
    }

    cache.set(key, {
      value,
      expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : undefined,
    });
  }

  evict(cacheName: string, key: string): boolean {
    const cache = this.caches.get(cacheName);
    if (!cache) return false;
    return cache.delete(key);
  }

  evictAll(cacheName: string): void {
    this.caches.delete(cacheName);
  }

  /** Get the number of entries in a named cache (excluding expired). */
  size(cacheName: string): number {
    const cache = this.caches.get(cacheName);
    if (!cache) return 0;

    const now = Date.now();
    let count = 0;
    for (const [key, entry] of cache) {
      if (entry.expiresAt !== undefined && now > entry.expiresAt) {
        cache.delete(key);
      } else {
        count++;
      }
    }
    return count;
  }
}
