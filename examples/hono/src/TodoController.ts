import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Response,
  Status,
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
  async getById(id: string) {
    const todo = await this.todoService.findById(id);
    if (!todo) return Response.status(404, { error: 'Todo not found' });
    return Response.ok(todo);
  }

  @Validated()
  @Status(201)
  @Post('/')
  async create(body: CreateTodoDto) {
    const todo = await this.todoService.create(body.title);
    return todo;
  }

  @Validated()
  @Patch('/:id')
  async update(id: string, body: UpdateTodoDto) {
    const todo = await this.todoService.update(id, body);
    if (!todo) return Response.status(404, { error: 'Todo not found' });
    return Response.ok(todo);
  }

  @Delete('/:id')
  async delete(id: string) {
    const todo = await this.todoService.delete(id);
    if (!todo) return Response.status(404, { error: 'Todo not found' });
    return Response.ok(todo);
  }
}
