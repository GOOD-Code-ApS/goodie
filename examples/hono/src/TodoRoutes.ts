import { Module, Provides } from '@goodie-ts/core';
import { type Request, Response, RouteDefinition } from '@goodie-ts/http';
import { validated } from '@goodie-ts/validation';
import { CreateTodoDto, UpdateTodoDto } from './dto.js';
import type { TodoService } from './TodoService.js';

@Module()
export class TodoRoutes {
  constructor(private readonly todoService: TodoService) {}

  @Provides()
  todoRoutes(): RouteDefinition {
    return RouteDefinition.build((router) => {
      router
        .get('/api/todos', async () => {
          const todos = await this.todoService.findAll();
          return Response.ok(todos);
        })
        .get('/api/todos/:id', async (req: Request) => {
          const todo = await this.todoService.findById(req.params.id);
          if (!todo) return Response.status(404, { error: 'Todo not found' });
          return Response.ok(todo);
        })
        .post('/api/todos', validated(CreateTodoDto), async (req) => {
          const todo = await this.todoService.create(req.body.title);
          return Response.created(todo);
        })
        .patch('/api/todos/:id', validated(UpdateTodoDto), async (req) => {
          const todo = await this.todoService.update(req.params.id, req.body);
          if (!todo) return Response.status(404, { error: 'Todo not found' });
          return Response.ok(todo);
        })
        .delete('/api/todos/:id', async (req: Request) => {
          const todo = await this.todoService.delete(req.params.id);
          if (!todo) return Response.status(404, { error: 'Todo not found' });
          return Response.ok(todo);
        });
    });
  }
}
