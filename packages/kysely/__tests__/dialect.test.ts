import { describe, expect, it } from 'vitest';
import {
  DIALECTS,
  supportsReturning,
  validateDialect,
} from '../src/dialect.js';

describe('Dialect', () => {
  describe('supportsReturning', () => {
    it('returns true for postgres', () => {
      expect(supportsReturning('postgres')).toBe(true);
    });

    it('returns true for sqlite', () => {
      expect(supportsReturning('sqlite')).toBe(true);
    });

    it('returns false for mysql', () => {
      expect(supportsReturning('mysql')).toBe(false);
    });

    it('returns true for neon (postgres-compatible)', () => {
      expect(supportsReturning('neon')).toBe(true);
    });

    it('returns false for planetscale (mysql-compatible)', () => {
      expect(supportsReturning('planetscale')).toBe(false);
    });

    it('returns true for d1 (sqlite-compatible)', () => {
      expect(supportsReturning('d1')).toBe(true);
    });

    it('returns true for libsql (sqlite-compatible)', () => {
      expect(supportsReturning('libsql')).toBe(true);
    });
  });

  describe('validateDialect', () => {
    it('returns the dialect for valid values', () => {
      for (const dialect of DIALECTS) {
        expect(validateDialect(dialect)).toBe(dialect);
      }
    });

    it('throws for unsupported dialect', () => {
      expect(() => validateDialect('oracle')).toThrow(
        /Unsupported datasource dialect: 'oracle'/,
      );
    });

    it('includes supported dialects in error message', () => {
      expect(() => validateDialect('mssql')).toThrow(
        /postgres, mysql, sqlite, neon, planetscale, d1, libsql/,
      );
    });
  });

  describe('DIALECTS', () => {
    it('contains all supported dialects', () => {
      expect(DIALECTS).toEqual([
        'postgres',
        'mysql',
        'sqlite',
        'neon',
        'planetscale',
        'd1',
        'libsql',
      ]);
    });
  });
});
