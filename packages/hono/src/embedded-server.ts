import { type ServerType, serve } from '@hono/node-server';
import type { Hono } from 'hono';

export class EmbeddedServer {
  readonly app: Hono;
  private server?: ServerType;

  constructor(app: Hono) {
    this.app = app;
  }

  listen(options?: { port?: number }): void {
    const port = options?.port ?? (Number(process.env.PORT) || 3000);
    this.server = serve({ fetch: this.app.fetch, port });
    console.log(`Server started on http://localhost:${port}`);
  }

  async stop(): Promise<void> {
    this.server?.close();
  }
}
