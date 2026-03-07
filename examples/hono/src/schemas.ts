import { ApiSchema } from '@goodie-ts/openapi';
import { z } from 'zod';

export const createTodoSchema = ApiSchema(
  z.object({
    title: z.string().min(1, 'Title must not be empty'),
  }),
  {
    type: 'object',
    properties: {
      title: { type: 'string' },
    },
    required: ['title'],
  },
);

export const updateTodoSchema = ApiSchema(
  z.object({
    title: z.string().min(1).optional(),
    completed: z.boolean().optional(),
  }),
  {
    type: 'object',
    properties: {
      title: { type: 'string' },
      completed: { type: 'boolean' },
    },
  },
);

export const todoSchema = ApiSchema(
  z.object({
    id: z.string().uuid(),
    title: z.string(),
    completed: z.boolean(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
  {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      completed: { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'title', 'completed', 'created_at', 'updated_at'],
  },
);

export const todoListSchema = ApiSchema(z.array(todoSchema), {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      completed: { type: 'boolean' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },
});

export const errorSchema = ApiSchema(
  z.object({
    error: z.string(),
  }),
  {
    type: 'object',
    properties: {
      error: { type: 'string' },
    },
    required: ['error'],
  },
);
