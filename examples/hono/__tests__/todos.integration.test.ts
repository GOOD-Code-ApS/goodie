import { createHonoRouter } from '@goodie-ts/hono';
import { TransactionManager } from '@goodie-ts/kysely';
import { createGoodieTest } from '@goodie-ts/testing/vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
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

  const test = createGoodieTest(buildDefinitions, {
    config: () => ({
      'datasource.url': container.getConnectionUri(),
      'datasource.dialect': 'postgres',
    }),
    fixtures: {
      app: (ctx) => createHonoRouter(ctx),
    },
    transactional: TransactionManager,
  });

  async function createTodo(
    app: ReturnType<typeof createHonoRouter>,
    title: string,
  ) {
    const res = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return res.json();
  }

  test('POST /api/todos creates a todo and returns 201', async ({ app }) => {
    const res = await app.request('/api/todos', {
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

  test('GET /api/todos lists all todos', async ({ app }) => {
    await createTodo(app, 'First item');
    await createTodo(app, 'Second item');

    const res = await app.request('/api/todos');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.map((t: { title: string }) => t.title)).toEqual([
      'First item',
      'Second item',
    ]);
  });

  test('GET /api/todos/:id returns a specific todo', async ({ app }) => {
    const created = await createTodo(app, 'Specific todo');

    const res = await app.request(`/api/todos/${created.id}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.title).toBe('Specific todo');
  });

  test('PATCH /api/todos/:id updates a todo', async ({ app }) => {
    const created = await createTodo(app, 'To be updated');

    const res = await app.request(`/api/todos/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.completed).toBe(true);
  });

  test('DELETE /api/todos/:id removes a todo', async ({ app }) => {
    const created = await createTodo(app, 'To be deleted');

    const res = await app.request(`/api/todos/${created.id}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
  });

  test('GET /api/todos/:id returns 404 for missing todo', async ({ app }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const res = await app.request(`/api/todos/${fakeId}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Todo not found');
  });

  // ── Validation tests ──

  test('POST /api/todos returns 400 when title is empty', async ({ app }) => {
    const res = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  test('POST /api/todos returns 400 when title exceeds 255 characters', async ({
    app,
  }) => {
    const longTitle = 'a'.repeat(256);

    const res = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: longTitle }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  test('POST /api/todos returns 400 when title is missing', async ({ app }) => {
    const res = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  test('PATCH /api/todos/:id returns 400 when title exceeds 255 characters', async ({
    app,
  }) => {
    const created = await createTodo(app, 'Valid title');

    const res = await app.request(`/api/todos/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'a'.repeat(256) }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toBeDefined();
  });

  test('POST /api/todos with valid title at exactly 255 chars succeeds', async ({
    app,
  }) => {
    const maxTitle = 'a'.repeat(255);

    const res = await app.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: maxTitle }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe(maxTitle);
  });
});
