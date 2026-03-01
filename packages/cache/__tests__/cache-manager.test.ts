import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheManager } from '../src/cache-manager.js';

describe('CacheManager', () => {
  let manager: CacheManager;

  beforeEach(() => {
    manager = new CacheManager();
  });

  it('should return undefined for cache miss', () => {
    expect(manager.get('todos', 'key1')).toBeUndefined();
  });

  it('should store and retrieve a value', () => {
    manager.put('todos', 'key1', { id: 1, title: 'Test' });
    expect(manager.get('todos', 'key1')).toEqual({ id: 1, title: 'Test' });
  });

  it('should isolate different cache names', () => {
    manager.put('todos', 'key1', 'todo-value');
    manager.put('users', 'key1', 'user-value');

    expect(manager.get('todos', 'key1')).toBe('todo-value');
    expect(manager.get('users', 'key1')).toBe('user-value');
  });

  it('should evict a specific key', () => {
    manager.put('todos', 'key1', 'value');
    manager.put('todos', 'key2', 'value2');

    expect(manager.evict('todos', 'key1')).toBe(true);
    expect(manager.get('todos', 'key1')).toBeUndefined();
    expect(manager.get('todos', 'key2')).toBe('value2');
  });

  it('should return false when evicting non-existent key', () => {
    expect(manager.evict('todos', 'missing')).toBe(false);
  });

  it('should evict all entries in a cache', () => {
    manager.put('todos', 'key1', 'v1');
    manager.put('todos', 'key2', 'v2');

    manager.evictAll('todos');

    expect(manager.get('todos', 'key1')).toBeUndefined();
    expect(manager.get('todos', 'key2')).toBeUndefined();
  });

  it('should respect TTL — expired entries return undefined', () => {
    vi.useFakeTimers();
    try {
      manager.put('todos', 'key1', 'value', 100);
      expect(manager.get('todos', 'key1')).toBe('value');

      vi.advanceTimersByTime(101);
      expect(manager.get('todos', 'key1')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not expire entries without TTL', () => {
    vi.useFakeTimers();
    try {
      manager.put('todos', 'key1', 'value');
      vi.advanceTimersByTime(999999);
      expect(manager.get('todos', 'key1')).toBe('value');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should overwrite existing entries', () => {
    manager.put('todos', 'key1', 'old');
    manager.put('todos', 'key1', 'new');
    expect(manager.get('todos', 'key1')).toBe('new');
  });

  it('should report correct size', () => {
    expect(manager.size('todos')).toBe(0);

    manager.put('todos', 'a', 1);
    manager.put('todos', 'b', 2);
    expect(manager.size('todos')).toBe(2);

    manager.evict('todos', 'a');
    expect(manager.size('todos')).toBe(1);
  });
});
