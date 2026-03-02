import { EmbeddedServer } from '@goodie-ts/hono';
import { TransactionManager } from '@goodie-ts/kysely';
import { createGoodieTest } from '@goodie-ts/testing/vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { buildDefinitions } from '../src/AppContext.generated.js';

describe('Hono + PostgreSQL Todo API', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
  }, 60_000);

  afterAll(async () => {
    await container?.stop();
  });

  const test = createGoodieTest(buildDefinitions(), {
    config: () => ({ DATABASE_URL: container.getConnectionUri() }),
    transactional: TransactionManager,
  });

  function app(
    resolve: (token: typeof EmbeddedServer) => EmbeddedServer,
  ): Hono {
    return resolve(EmbeddedServer).app;
  }

  async function createTodo(honoApp: Hono, title: string) {
    const res = await honoApp.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return res.json();
  }

  test('POST /api/todos creates a todo and returns 201', async ({
    resolve,
  }) => {
    const honoApp = app(resolve);

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

  test('GET /api/todos lists all todos', async ({ resolve }) => {
    const honoApp = app(resolve);
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

  test('GET /api/todos/:id returns a specific todo', async ({ resolve }) => {
    const honoApp = app(resolve);
    const created = await createTodo(honoApp, 'Specific todo');

    const res = await honoApp.request(`/api/todos/${created.id}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.title).toBe('Specific todo');
  });

  test('PATCH /api/todos/:id updates a todo', async ({ resolve }) => {
    const honoApp = app(resolve);
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

  test('DELETE /api/todos/:id removes a todo', async ({ resolve }) => {
    const honoApp = app(resolve);
    const created = await createTodo(honoApp, 'To be deleted');

    const res = await honoApp.request(`/api/todos/${created.id}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
  });

  test('GET /api/todos/:id returns 404 for missing todo', async ({
    resolve,
  }) => {
    const honoApp = app(resolve);
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const res = await honoApp.request(`/api/todos/${fakeId}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Todo not found');
  });
});
