import { serve } from '@hono/node-server';
import { app, createRouter } from './AppContext.generated.js';

async function main() {
  const ctx = await app.start();

  const server = createRouter(ctx);

  console.log('Server starting on http://localhost:3000');
  serve({ fetch: server.fetch, port: 3000 });
}

main().catch(console.error);
