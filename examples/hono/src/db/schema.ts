import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const todos = pgTable('todos', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  completed: boolean('completed').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
