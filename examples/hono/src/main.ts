import { MDC } from '@goodie-ts/logging';
import { serve } from '@hono/node-server';
import { requestId } from 'hono/request-id';
import { app, createRouter } from './AppContext.generated.js';
import { ServerConfig } from './ServerConfig.js';

async function main() {
  const ctx = await app.start();

  const server = createRouter(ctx);

  // Add request ID + MDC middleware so trace IDs propagate to service-layer logs
  server.use(requestId());
  server.use(async (c, next) => {
    const traceId = c.get('requestId');
    await MDC.run(new Map([['traceId', traceId]]), () => next());
  });

  const serverConfig = ctx.get(ServerConfig);
  console.log(
    `Server starting on http://${serverConfig.host}:${serverConfig.port}`,
  );
  serve({ fetch: server.fetch, port: serverConfig.port });
}

main().catch(console.error);
