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
      expect(() => validateDialect('mssql')).toThrow(/postgres, mysql, sqlite/);
    });
  });

  describe('DIALECTS', () => {
    it('contains all supported dialects', () => {
      expect(DIALECTS).toEqual(['postgres', 'mysql', 'sqlite']);
    });
  });
});
