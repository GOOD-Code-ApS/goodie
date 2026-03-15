import { describe, expect, it } from 'vitest';
import { flattenObject } from '../src/config-loader.js';

describe('flattenObject', () => {
  it('should return empty object for empty input', () => {
    expect(flattenObject({})).toEqual({});
  });

  it('should flatten top-level values to strings', () => {
    expect(flattenObject({ host: 'localhost', port: 5432 })).toEqual({
      host: 'localhost',
      port: '5432',
    });
  });

  it('should flatten nested objects with dot-separated keys', () => {
    const result = flattenObject({
      database: { host: 'localhost', port: 5432 },
    });
    expect(result).toEqual({
      'database.host': 'localhost',
      'database.port': '5432',
    });
  });

  it('should flatten deeply nested objects', () => {
    const result = flattenObject({
      app: { db: { connection: { host: '127.0.0.1' } } },
    });
    expect(result).toEqual({
      'app.db.connection.host': '127.0.0.1',
    });
  });

  it('should stringify boolean and null values', () => {
    const result = flattenObject({ debug: true, value: null });
    expect(result).toEqual({
      debug: 'true',
      value: 'null',
    });
  });

  it('should stringify arrays', () => {
    const result = flattenObject({ tags: ['a', 'b'] });
    expect(result).toEqual({ tags: 'a,b' });
  });

  it('should apply prefix when provided', () => {
    const result = flattenObject({ host: 'localhost' }, 'db');
    expect(result).toEqual({ 'db.host': 'localhost' });
  });
});
