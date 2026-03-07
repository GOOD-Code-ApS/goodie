import { z } from 'zod';

export const createTodoSchema = z.object({
  title: z.string().min(1, 'Title must not be empty'),
});

export const updateTodoSchema = z.object({
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
});

export const todoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  completed: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const todoListSchema = z.array(todoSchema);

export const errorSchema = z.object({
  error: z.string(),
});
