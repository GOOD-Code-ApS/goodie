import type { Generated, Selectable } from 'kysely';

export interface Database {
  todos: TodoTable;
}

export interface TodoTable {
  id: Generated<string>;
  title: string;
  completed: boolean;
  created_at: Generated<Date>;
}

export type Todo = Selectable<TodoTable>;
