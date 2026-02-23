import { Hono } from 'hono';
import type { TodoService } from './TodoService.js';

export function createTodoRoutes(todoService: TodoService): Hono {
  const router = new Hono();

  router.get('/todos', async (c) => {
    const todos = await todoService.findAll();
    return c.json(todos);
  });

  router.get('/todos/:id', async (c) => {
    const todo = await todoService.findById(c.req.param('id'));
    if (!todo) {
      return c.json({ error: 'Todo not found' }, 404);
    }
    return c.json(todo);
  });

  router.post('/todos', async (c) => {
    const body = await c.req.json<{ title: string }>();
    const todo = await todoService.create(body.title);
    return c.json(todo, 201);
  });

  router.patch('/todos/:id', async (c) => {
    const body = await c.req.json<{ title?: string; completed?: boolean }>();
    const todo = await todoService.update(c.req.param('id'), body);
    if (!todo) {
      return c.json({ error: 'Todo not found' }, 404);
    }
    return c.json(todo);
  });

  router.delete('/todos/:id', async (c) => {
    const todo = await todoService.delete(c.req.param('id'));
    if (!todo) {
      return c.json({ error: 'Todo not found' }, 404);
    }
    return c.json(todo);
  });

  return router;
}
