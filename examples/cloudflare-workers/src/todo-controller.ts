import {
  Controller,
  Delete,
  Get,
  Post,
  Response,
  Status,
} from '@goodie-ts/http';
// biome-ignore lint/style/useImportType: DI requires value import for constructor injection
import { KyselyDatabase } from '@goodie-ts/kysely';
import type { Database } from './db/schema.js';
import type { CreateTodoDto } from './dto.js';

@Controller('/api/todos')
export class TodoController {
  constructor(private readonly db: KyselyDatabase) {}

  private get kysely() {
    return this.db.kysely as import('kysely').Kysely<Database>;
  }

  @Get('/')
  async getAll() {
    const todos = await this.kysely.selectFrom('todos').selectAll().execute();
    return Response.ok(todos);
  }

  @Get('/:id')
  async getById(id: number) {
    const todo = await this.kysely
      .selectFrom('todos')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!todo) return Response.status(404, { error: 'Todo not found' });
    return Response.ok(todo);
  }

  @Status(201)
  @Post('/')
  async create(body: CreateTodoDto) {
    const todo = await this.kysely
      .insertInto('todos')
      .values({ title: body.title })
      .returningAll()
      .executeTakeFirstOrThrow();
    return todo;
  }

  @Delete('/:id')
  async delete(id: number) {
    const todo = await this.kysely
      .deleteFrom('todos')
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    if (!todo) return Response.status(404, { error: 'Todo not found' });
    return Response.ok(todo);
  }
}
