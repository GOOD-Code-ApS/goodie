import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  type Request,
  Response,
} from '@goodie-ts/http';
import type { TodoService } from './TodoService.js';

@Controller('/api/todos')
export class TodoController {
  constructor(private todoService: TodoService) {}

  @Get('/')
  async getAll() {
    const todos = await this.todoService.findAll();
    return Response.ok(todos);
  }

  @Get('/:id')
  async getById(req: Request) {
    const todo = await this.todoService.findById(req.params.id);
    if (!todo) return Response.status(404, { error: 'Todo not found' });
    return Response.ok(todo);
  }

  @Post('/')
  async create(req: Request<{ title: string }>) {
    const todo = await this.todoService.create(req.body.title);
    return Response.created(todo);
  }

  @Patch('/:id')
  async update(req: Request<{ title?: string; completed?: boolean }>) {
    const todo = await this.todoService.update(req.params.id, req.body);
    if (!todo) return Response.status(404, { error: 'Todo not found' });
    return Response.ok(todo);
  }

  @Delete('/:id')
  async delete(req: Request) {
    const todo = await this.todoService.delete(req.params.id);
    if (!todo) return Response.status(404, { error: 'Todo not found' });
    return Response.ok(todo);
  }
}
