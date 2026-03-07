import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbeddedServer } from '../src/embedded-server.js';
import type { ServerConfig } from '../src/server-config.js';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    host: 'localhost',
    port: 3000,
    runtime: 'node',
    ...overrides,
  } as ServerConfig;
}

const fakeApp = { fetch: vi.fn() } as any;

describe('EmbeddedServer', () => {
  describe('app getter', () => {
    it('throws before listen() is called', () => {
      const server = new EmbeddedServer(makeConfig());
      expect(() => server.app).toThrow(/Call listen\(app\) first/);
    });
  });

  describe('node runtime', () => {
    it('calls @hono/node-server serve() and stop works', async () => {
      const closeFn = vi.fn((cb: (err?: Error) => void) => cb());
      const fakeServer = { close: closeFn };

      vi.doMock('@hono/node-server', () => ({
        serve: vi.fn(() => fakeServer),
      }));

      const { EmbeddedServer: ES } = await import('../src/embedded-server.js');
      const server = new ES(makeConfig({ runtime: 'node' }));
      await server.listen(fakeApp);

      expect(server.app).toBe(fakeApp);

      await server.stop();
      expect(closeFn).toHaveBeenCalledOnce();

      vi.doUnmock('@hono/node-server');
    });
  });

  describe('bun runtime', () => {
    let originalBun: unknown;

    beforeEach(() => {
      originalBun = (globalThis as any).Bun;
    });

    afterEach(() => {
      if (originalBun === undefined) {
        delete (globalThis as any).Bun;
      } else {
        (globalThis as any).Bun = originalBun;
      }
    });

    it('calls Bun.serve() with correct options', async () => {
      const stopFn = vi.fn();
      const serveFn = vi.fn(() => ({ stop: stopFn }));
      (globalThis as any).Bun = { serve: serveFn };

      const server = new EmbeddedServer(
        makeConfig({ runtime: 'bun', port: 4000, host: '0.0.0.0' }),
      );
      await server.listen(fakeApp);

      expect(serveFn).toHaveBeenCalledWith({
        fetch: fakeApp.fetch,
        port: 4000,
        hostname: '0.0.0.0',
      });

      await server.stop();
      expect(stopFn).toHaveBeenCalledOnce();
    });

    it('throws when Bun.serve is not available', async () => {
      delete (globalThis as any).Bun;

      const server = new EmbeddedServer(makeConfig({ runtime: 'bun' }));
      await expect(server.listen(fakeApp)).rejects.toThrow(
        /Bun\.serve is not available/,
      );
    });
  });

  describe('deno runtime', () => {
    let originalDeno: unknown;

    beforeEach(() => {
      originalDeno = (globalThis as any).Deno;
    });

    afterEach(() => {
      if (originalDeno === undefined) {
        delete (globalThis as any).Deno;
      } else {
        (globalThis as any).Deno = originalDeno;
      }
    });

    it('calls Deno.serve() with correct options', async () => {
      const shutdownFn = vi.fn();
      const serveFn = vi.fn(() => ({ shutdown: shutdownFn }));
      (globalThis as any).Deno = { serve: serveFn };

      const server = new EmbeddedServer(
        makeConfig({ runtime: 'deno', port: 5000, host: '127.0.0.1' }),
      );
      await server.listen(fakeApp);

      expect(serveFn).toHaveBeenCalledWith(
        { port: 5000, hostname: '127.0.0.1' },
        fakeApp.fetch,
      );

      await server.stop();
      expect(shutdownFn).toHaveBeenCalledOnce();
    });

    it('throws when Deno.serve is not available', async () => {
      delete (globalThis as any).Deno;

      const server = new EmbeddedServer(makeConfig({ runtime: 'deno' }));
      await expect(server.listen(fakeApp)).rejects.toThrow(
        /Deno\.serve is not available/,
      );
    });
  });

  describe('cloudflare runtime', () => {
    it('throws — cloudflare uses export default, not EmbeddedServer', async () => {
      const server = new EmbeddedServer(makeConfig({ runtime: 'cloudflare' }));
      await expect(server.listen(fakeApp)).rejects.toThrow(
        /does not support Cloudflare Workers/,
      );
    });
  });

  describe('unsupported runtime', () => {
    it('throws for unknown runtime', async () => {
      const server = new EmbeddedServer(
        makeConfig({ runtime: 'unknown' as any }),
      );
      await expect(server.listen(fakeApp)).rejects.toThrow(
        /Unsupported server runtime: 'unknown'/,
      );
    });
  });

  describe('stop()', () => {
    it('is a no-op when listen() was never called', async () => {
      const server = new EmbeddedServer(makeConfig());
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });
});
