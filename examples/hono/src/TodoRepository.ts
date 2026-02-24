import { Singleton } from '@goodie-ts/decorators';
import { eq } from 'drizzle-orm';
import type { Database } from './Database.js';
import { todos } from './db/schema.js';

@Singleton()
export class TodoRepository {
  constructor(private database: Database) {}

  async findAll() {
    return this.database.drizzle.select().from(todos);
  }

  async findById(id: string) {
    const rows = await this.database.drizzle
      .select()
      .from(todos)
      .where(eq(todos.id, id));
    return rows[0];
  }

  async create(title: string) {
    const rows = await this.database.drizzle
      .insert(todos)
      .values({ title })
      .returning();
    return rows[0];
  }

  async update(id: string, data: { title?: string; completed?: boolean }) {
    const rows = await this.database.drizzle
      .update(todos)
      .set(data)
      .where(eq(todos.id, id))
      .returning();
    return rows[0];
  }

  async delete(id: string) {
    const rows = await this.database.drizzle
      .delete(todos)
      .where(eq(todos.id, id))
      .returning();
    return rows[0];
  }
}
