import { Singleton } from '@goodie-ts/core';
import type { Hono } from 'hono';
import type { ServerConfig, ServerRuntime } from './server-config.js';

@Singleton()
export class EmbeddedServer {
  private _app?: Hono;
  private _close?: () => Promise<void>;

  constructor(private readonly config: ServerConfig) {}

  get app(): Hono {
    if (!this._app) {
      throw new Error(
        'EmbeddedServer: app not available. Call listen(app) first.',
      );
    }
    return this._app;
  }

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
        "EmbeddedServer does not support 'cloudflare' runtime. " +
          'Use createRouter(ctx) directly in your Cloudflare Workers entry point.',
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
  // Bun.serve is a global — available at runtime in Bun environments
  const bunGlobal = globalThis as any;
  if (!bunGlobal.Bun?.serve) {
    throw new Error(
      "EmbeddedServer: runtime is 'bun' but Bun.serve is not available. " +
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
  // Deno.serve is a global — available at runtime in Deno environments
  const denoGlobal = globalThis as any;
  if (!denoGlobal.Deno?.serve) {
    throw new Error(
      "EmbeddedServer: runtime is 'deno' but Deno.serve is not available. " +
        'Are you running in a Deno environment?',
    );
  }
  const server = denoGlobal.Deno.serve({ port, hostname }, app.fetch);
  return async () => {
    await server.shutdown();
  };
}
