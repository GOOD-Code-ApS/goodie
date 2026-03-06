import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flattenObject, loadConfigFiles } from '../src/config-loader.js';

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

describe('loadConfigFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goodie-config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty object when directory has no config files', () => {
    expect(loadConfigFiles(tmpDir)).toEqual({});
  });

  it('should load default.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'default.json'),
      JSON.stringify({ database: { host: 'localhost', port: 5432 } }),
    );

    const result = loadConfigFiles(tmpDir);

    expect(result).toEqual({
      'database.host': 'localhost',
      'database.port': '5432',
    });
  });

  it('should load env-specific file and merge over defaults', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'default.json'),
      JSON.stringify({ database: { host: 'localhost', port: 5432 } }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'production.json'),
      JSON.stringify({ database: { host: 'prod-db.example.com' } }),
    );

    const result = loadConfigFiles(tmpDir, 'production');

    expect(result).toEqual({
      'database.host': 'prod-db.example.com',
      'database.port': '5432',
    });
  });

  it('should ignore env file when env is not specified', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'default.json'),
      JSON.stringify({ key: 'default' }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'production.json'),
      JSON.stringify({ key: 'production' }),
    );

    const result = loadConfigFiles(tmpDir);

    expect(result).toEqual({ key: 'default' });
  });

  it('should work with only env file (no default.json)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test.json'),
      JSON.stringify({ api: { url: 'http://test-api' } }),
    );

    const result = loadConfigFiles(tmpDir, 'test');

    expect(result).toEqual({ 'api.url': 'http://test-api' });
  });

  it('should handle non-existent directory gracefully', () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist');
    expect(loadConfigFiles(nonExistent)).toEqual({});
  });

  it('should throw a descriptive error for malformed default.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'default.json'), '{ invalid json }');

    expect(() => loadConfigFiles(tmpDir)).toThrow(
      /Failed to parse config file.*default\.json/,
    );
  });

  it('should throw a descriptive error for malformed env-specific json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'default.json'),
      JSON.stringify({ key: 'value' }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'production.json'),
      'not valid json at all',
    );

    expect(() => loadConfigFiles(tmpDir, 'production')).toThrow(
      /Failed to parse config file.*production\.json/,
    );
  });
});
