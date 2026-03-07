import {
  Anonymous,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Secured,
  Validate,
} from '@goodie-ts/hono';
import type { Context } from 'hono';
import { createTodoSchema, updateTodoSchema } from './schemas.js';
import type { TodoService } from './TodoService.js';

@Controller('/api/todos')
@Secured()
export class TodoController {
  constructor(private todoService: TodoService) {}

  @Get('/', {
    summary: 'List all todos',
    description: 'Returns all todo items',
    tags: ['Todos'],
    responses: {
      200: { description: 'List of todos' },
    },
  })
  @Anonymous()
  async getAll(c: Context) {
    const todos = await this.todoService.findAll();
    return c.json(todos);
  }

  @Get('/:id')
  async getById(c: Context) {
    const todo = await this.todoService.findById(c.req.param('id'));
    if (!todo) return c.json({ error: 'Todo not found' }, 404);
    return c.json(todo);
  }

  @Post('/')
  @Validate({ json: createTodoSchema })
  async create(c: Context) {
    const body = await c.req.json<{ title: string }>();
    const todo = await this.todoService.create(body.title);
    return c.json(todo, 201);
  }

  @Patch('/:id')
  @Validate({ json: updateTodoSchema })
  async update(c: Context) {
    const body = await c.req.json<{ title?: string; completed?: boolean }>();
    const todo = await this.todoService.update(c.req.param('id'), body);
    if (!todo) return c.json({ error: 'Todo not found' }, 404);
    return c.json(todo);
  }

  @Delete('/:id')
  async delete(c: Context) {
    const todo = await this.todoService.delete(c.req.param('id'));
    if (!todo) return c.json({ error: 'Todo not found' }, 404);
    return c.json(todo);
  }
}
