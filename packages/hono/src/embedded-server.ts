import type { ApplicationContext } from '@goodie-ts/core';
import { Singleton } from '@goodie-ts/core';
import { EmbeddedServer, Router } from '@goodie-ts/http';
import type { Hono } from 'hono';
import { adaptRouter } from './adapt-router.js';
import type { ServerConfig, ServerRuntime } from './server-config.js';

/**
 * Hono implementation of `EmbeddedServer`.
 *
 * Auto-discovered by `GoodieBuilder.start()` via `baseTokens: [EmbeddedServer]`.
 * Builds a `Router` from the context, adapts it to Hono, and starts
 * listening on the configured host/port/runtime.
 *
 * Multi-runtime: Node (`@hono/node-server`), Bun (`Bun.serve`), Deno (`Deno.serve`).
 * Cloudflare Workers: use `Router.fromContext(ctx)` + `adaptRouter()` directly.
 */
@Singleton()
export class HonoEmbeddedServer extends EmbeddedServer {
  private _app?: Hono;
  private _close?: () => Promise<void>;

  constructor(private readonly config: ServerConfig) {
    super();
  }

  /** The Hono app instance. Only available after `start()` has been called. */
  get app(): Hono {
    if (!this._app) {
      throw new Error(
        'HonoEmbeddedServer: app not available. Call start() first.',
      );
    }
    return this._app;
  }

  /**
   * Build the Router, adapt to Hono, and start listening.
   * Called automatically by `GoodieBuilder.start()`.
   */
  async start(ctx: ApplicationContext): Promise<void> {
    const router = Router.fromContext(ctx);
    const hono = adaptRouter(router, ctx);
    await this.listen(hono);
  }

  /**
   * Start listening with an externally-built Hono app.
   * Useful for advanced setups where you need to customize the Hono instance.
   */
  async listen(
    app: Hono,
    options?: { port?: number; host?: string },
  ): Promise<void> {
    this._app = app;
    const port = options?.port ?? this.config.port;
    const hostname = options?.host ?? this.config.host;
    const runtime = this.config.runtime;

    this._close = await startRuntime(runtime, app, port, hostname);
    console.log(
      `Server started on http://${hostname}:${port} (runtime: ${runtime})`,
    );
  }

  async stop(): Promise<void> {
    if (this._close) {
      await this._close();
      this._close = undefined;
    }
  }
}

async function startRuntime(
  runtime: ServerRuntime,
  app: Hono,
  port: number,
  hostname: string,
): Promise<() => Promise<void>> {
  switch (runtime) {
    case 'node':
      return startNode(app, port, hostname);
    case 'bun':
      return startBun(app, port, hostname);
    case 'deno':
      return startDeno(app, port, hostname);
    case 'cloudflare':
      throw new Error(
        "HonoEmbeddedServer does not support 'cloudflare' runtime. " +
          'Use Router.fromContext(ctx) and adaptRouter() directly in your Workers entry point.',
      );
    default:
      throw new Error(
        `Unsupported server runtime: '${runtime}'. ` +
          `Supported runtimes: node, bun, deno`,
      );
  }
}

async function startNode(
  app: Hono,
  port: number,
  hostname: string,
): Promise<() => Promise<void>> {
  const { serve } = await import('@hono/node-server');
  const server = serve({ fetch: app.fetch, port, hostname });
  return () =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
}

async function startBun(
  app: Hono,
  port: number,
  hostname: string,
): Promise<() => Promise<void>> {
  const bunGlobal = globalThis as any;
  if (!bunGlobal.Bun?.serve) {
    throw new Error(
      "HonoEmbeddedServer: runtime is 'bun' but Bun.serve is not available. " +
        'Are you running in a Bun environment?',
    );
  }
  const server = bunGlobal.Bun.serve({
    fetch: app.fetch,
    port,
    hostname,
  });
  return async () => {
    server.stop();
  };
}

async function startDeno(
  app: Hono,
  port: number,
  hostname: string,
): Promise<() => Promise<void>> {
  const denoGlobal = globalThis as any;
  if (!denoGlobal.Deno?.serve) {
    throw new Error(
      "HonoEmbeddedServer: runtime is 'deno' but Deno.serve is not available. " +
        'Are you running in a Deno environment?',
    );
  }
  const server = denoGlobal.Deno.serve({ port, hostname }, app.fetch);
  return async () => {
    await server.shutdown();
  };
}
