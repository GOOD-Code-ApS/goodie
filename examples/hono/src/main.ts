import { TransactionManager } from '@goodie-ts/kysely';
import { MDC } from '@goodie-ts/logging';
import { serve } from '@hono/node-server';
import { requestId } from 'hono/request-id';
import { app, createRouter } from './AppContext.generated.js';
import { Database } from './Database.js';

async function main() {
  const ctx = await app.start();

  // Configure TransactionManager with the Kysely instance from Database
  const database = ctx.get(Database);
  const transactionManager = ctx.get(TransactionManager);
  transactionManager.configure(database.kysely);

  const server = createRouter(ctx);

  // Add request ID + MDC middleware so trace IDs propagate to service-layer logs
  server.use(requestId());
  server.use(async (c, next) => {
    const traceId = c.get('requestId');
    await MDC.run(new Map([['traceId', traceId]]), () => next());
  });

  console.log('Server starting on http://localhost:3000');
  serve({ fetch: server.fetch, port: 3000 });
}

main().catch(console.error);
