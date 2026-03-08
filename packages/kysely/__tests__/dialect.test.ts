import { describe, expect, it } from 'vitest';
import { DIALECTS } from '../src/dialect.js';

describe('Dialect', () => {
  describe('DIALECTS', () => {
    it('contains all supported dialects', () => {
      expect(DIALECTS).toEqual([
        'postgres',
        'mysql',
        'sqlite',
        'neon',
        'planetscale',
        'libsql',
        'd1',
      ]);
    });
  });
});
