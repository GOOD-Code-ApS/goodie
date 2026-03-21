import type { Generated, Selectable } from 'kysely';

export interface Database {
  todos: TodoTable;
}

export interface TodoTable {
  id: Generated<number>;
  title: string;
  completed: Generated<number>;
  created_at: Generated<string>;
}

export type Todo = Selectable<TodoTable>;
