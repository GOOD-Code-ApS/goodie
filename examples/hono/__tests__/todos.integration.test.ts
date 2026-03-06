import type { ApplicationContext } from '@goodie-ts/core';
import { TransactionManager } from '@goodie-ts/kysely';
import { createGoodieTest } from '@goodie-ts/testing/vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { buildDefinitions, createRouter } from '../src/AppContext.generated.js';

describe('Hono + PostgreSQL Todo API', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  }, 60_000);

  afterAll(async () => {
    await container?.stop();
  });

  const test = createGoodieTest(buildDefinitions(), {
    config: () => ({
      'datasource.url': container.getConnectionUri(),
      'datasource.dialect': 'postgres',
    }),
    transactional: TransactionManager,
  });

  function app(ctx: ApplicationContext): Hono {
    return createRouter(ctx);
  }

  async function createTodo(honoApp: Hono, title: string) {
    const res = await honoApp.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return res.json();
  }

  test('POST /api/todos creates a todo and returns 201', async ({ ctx }) => {
    const honoApp = app(ctx);

    const res = await honoApp.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Buy groceries' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Buy groceries');
    expect(body.completed).toBe(false);
    expect(body.id).toBeDefined();
  });

  test('GET /api/todos lists all todos', async ({ ctx }) => {
    const honoApp = app(ctx);
    await createTodo(honoApp, 'First item');
    await createTodo(honoApp, 'Second item');

    const res = await honoApp.request('/api/todos');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.map((t: { title: string }) => t.title)).toEqual([
      'First item',
      'Second item',
    ]);
  });

  test('GET /api/todos/:id returns a specific todo', async ({ ctx }) => {
    const honoApp = app(ctx);
    const created = await createTodo(honoApp, 'Specific todo');

    const res = await honoApp.request(`/api/todos/${created.id}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.title).toBe('Specific todo');
  });

  test('PATCH /api/todos/:id updates a todo', async ({ ctx }) => {
    const honoApp = app(ctx);
    const created = await createTodo(honoApp, 'To be updated');

    const res = await honoApp.request(`/api/todos/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.completed).toBe(true);
  });

  test('DELETE /api/todos/:id removes a todo', async ({ ctx }) => {
    const honoApp = app(ctx);
    const created = await createTodo(honoApp, 'To be deleted');

    const res = await honoApp.request(`/api/todos/${created.id}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
  });

  test('GET /api/todos/:id returns 404 for missing todo', async ({ ctx }) => {
    const honoApp = app(ctx);
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const res = await honoApp.request(`/api/todos/${fakeId}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Todo not found');
  });

  test('POST /api/todos returns 400 for missing title', async ({ ctx }) => {
    const honoApp = app(ctx);

    const res = await honoApp.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.any(String) }),
      ]),
    );
  });

  test('POST /api/todos returns 400 for empty title', async ({ ctx }) => {
    const honoApp = app(ctx);

    const res = await honoApp.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(body.issues[0].message).toBe('Title must not be empty');
  });

  test('PATCH /api/todos/:id returns 400 for invalid completed field', async ({
    ctx,
  }) => {
    const honoApp = app(ctx);
    const created = await createTodo(honoApp, 'Valid todo');

    const res = await honoApp.request(`/api/todos/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: 'not-a-boolean' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
  });
});
