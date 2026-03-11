import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  type Request,
  Response,
} from '@goodie-ts/http';
import { Validated } from '@goodie-ts/validation';
import type { CreateTodoDto, UpdateTodoDto } from './dto.js';
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

  @Validated()
  @Post('/')
  async create(req: Request<CreateTodoDto>) {
    const todo = await this.todoService.create(req.body.title);
    return Response.created(todo);
  }

  @Validated()
  @Patch('/:id')
  async update(req: Request<UpdateTodoDto>) {
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
