import { z } from 'zod';

export const createTodoSchema = z.object({
  title: z.string().min(1, 'Title must not be empty'),
});

export const updateTodoSchema = z.object({
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
});
