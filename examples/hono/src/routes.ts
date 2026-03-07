import { Validate } from '@goodie-ts/hono';
import { Controller, Delete, Get, Patch, Post } from '@goodie-ts/http';
import { ApiOperation, ApiResponse, ApiTag } from '@goodie-ts/openapi';
import { Anonymous, Secured } from '@goodie-ts/security';
import type { Context } from 'hono';
import {
  createTodoSchema,
  errorSchema,
  todoListSchema,
  todoSchema,
  updateTodoSchema,
} from './schemas.js';
import type { TodoService } from './TodoService.js';

@Controller('/api/todos')
@Secured()
@ApiTag('Todos')
export class TodoController {
  constructor(private todoService: TodoService) {}

  @Get('/')
  @Anonymous()
  @ApiOperation({ summary: 'List all todos' })
  @ApiResponse(200, 'List of todos', { schema: todoListSchema })
  async getAll(c: Context) {
    const todos = await this.todoService.findAll();
    return c.json(todos);
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get a todo by ID' })
  @ApiResponse(200, 'The requested todo', { schema: todoSchema })
  @ApiResponse(401, 'Authentication required')
  @ApiResponse(404, 'Todo not found', { schema: errorSchema })
  async getById(c: Context) {
    const todo = await this.todoService.findById(c.req.param('id'));
    if (!todo) return c.json({ error: 'Todo not found' }, 404);
    return c.json(todo);
  }

  @Post('/')
  @Validate({ json: createTodoSchema })
  @ApiOperation({ summary: 'Create a new todo' })
  @ApiResponse(201, 'Todo created', { schema: todoSchema })
  @ApiResponse(401, 'Authentication required')
  async create(c: Context) {
    const body = await c.req.json<{ title: string }>();
    const todo = await this.todoService.create(body.title);
    return c.json(todo, 201);
  }

  @Patch('/:id')
  @Validate({ json: updateTodoSchema })
  @ApiOperation({ summary: 'Update a todo' })
  @ApiResponse(200, 'Updated todo', { schema: todoSchema })
  @ApiResponse(401, 'Authentication required')
  @ApiResponse(404, 'Todo not found', { schema: errorSchema })
  async update(c: Context) {
    const body = await c.req.json<{ title?: string; completed?: boolean }>();
    const todo = await this.todoService.update(c.req.param('id'), body);
    if (!todo) return c.json({ error: 'Todo not found' }, 404);
    return c.json(todo);
  }

  @Delete('/:id')
  @ApiOperation({ summary: 'Delete a todo' })
  @ApiResponse(200, 'Deleted todo', { schema: todoSchema })
  @ApiResponse(401, 'Authentication required')
  @ApiResponse(404, 'Todo not found', { schema: errorSchema })
  async delete(c: Context) {
    const todo = await this.todoService.delete(c.req.param('id'));
    if (!todo) return c.json({ error: 'Todo not found' }, 404);
    return c.json(todo);
  }
}
