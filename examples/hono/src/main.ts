import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { app } from './AppContext.generated.js';
import { createTodoRoutes } from './routes.js';
import { TodoService } from './TodoService.js';

async function main() {
  const ctx = await app.start();

  const todoService = ctx.get(TodoService);
  const server = new Hono();
  server.route('/api', createTodoRoutes(todoService));

  console.log('Server starting on http://localhost:3000');
  serve({ fetch: server.fetch, port: 3000 });
}

main().catch(console.error);
