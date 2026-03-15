import { describe, expect, it } from 'vitest';
import { HttpContext } from '../src/http-context.js';

describe('HttpContext', () => {
  describe('cookie()', () => {
    it('returns a cookie value by name', () => {
      const ctx = new HttpContext({
        headers: new Headers({ Cookie: 'session=abc123; theme=dark' }),
      });

      expect(ctx.cookie('session')).toBe('abc123');
      expect(ctx.cookie('theme')).toBe('dark');
    });

    it('returns undefined for missing cookies', () => {
      const ctx = new HttpContext({
        headers: new Headers({ Cookie: 'session=abc123' }),
      });

      expect(ctx.cookie('missing')).toBeUndefined();
    });

    it('returns undefined when no Cookie header exists', () => {
      const ctx = new HttpContext({ headers: new Headers() });

      expect(ctx.cookie('session')).toBeUndefined();
    });

    it('handles cookie names with regex metacharacters', () => {
      const ctx = new HttpContext({
        headers: new Headers({
          Cookie: '__host.name=safe; normal=value',
        }),
      });

      // Without escaping, "." would match any character, potentially
      // matching "__hostname" instead of "__host.name"
      expect(ctx.cookie('__host.name')).toBe('safe');
      expect(ctx.cookie('__hostXname')).toBeUndefined();
    });
  });
});
