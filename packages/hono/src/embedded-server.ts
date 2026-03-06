import { Singleton } from '@goodie-ts/core';
import { type ServerType, serve } from '@hono/node-server';
import type { Hono } from 'hono';
import type { ServerConfig } from './server-config.js';

@Singleton()
export class EmbeddedServer {
  private server?: ServerType;
  private _app?: Hono;

  constructor(private readonly config: ServerConfig) {}

  get app(): Hono {
    if (!this._app) {
      throw new Error(
        'EmbeddedServer: app not available. Call listen(app) first.',
      );
    }
    return this._app;
  }

  listen(app: Hono, options?: { port?: number; host?: string }): void {
    this._app = app;
    const port = options?.port ?? this.config.port;
    const hostname = options?.host ?? this.config.host;
    this.server = serve({ fetch: app.fetch, port, hostname });
    console.log(`Server started on http://${hostname}:${port}`);
  }

  async stop(): Promise<void> {
    this.server?.close();
  }
}
