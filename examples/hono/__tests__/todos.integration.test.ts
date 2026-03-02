import { createGoodieTest } from '@goodie-ts/testing/vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { Hono } from 'hono';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { createRouter, definitions } from '../src/AppContext.generated.js';

describe('Hono + PostgreSQL Todo API', () => {
  let container: StartedPostgreSqlContainer;
  let honoApp: Hono;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();

    const connectionUri = container.getConnectionUri();
    const pool = new Pool({ connectionString: connectionUri });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await pool.end();
  }, 60_000);

  afterAll(async () => {
    await container?.stop();
  });

  const test = createGoodieTest(definitions, {
    config: () => ({ DATABASE_URL: container.getConnectionUri() }),
  });

  test('setup: create router from ctx', ({ ctx }) => {
    honoApp = createRouter(ctx);
    expect(honoApp).toBeDefined();
  });

  test('POST /api/todos creates a todo and returns 201', async () => {
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

  test('GET /api/todos lists all todos', async () => {
    const res = await honoApp.request('/api/todos');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].title).toBe('Buy groceries');
  });

  test('GET /api/todos/:id returns a specific todo', async () => {
    const listRes = await honoApp.request('/api/todos');
    const todos = await listRes.json();
    const todoId = todos[0].id;

    const res = await honoApp.request(`/api/todos/${todoId}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(todoId);
    expect(body.title).toBe('Buy groceries');
  });

  test('PATCH /api/todos/:id updates a todo', async () => {
    const listRes = await honoApp.request('/api/todos');
    const todos = await listRes.json();
    const todoId = todos[0].id;

    const res = await honoApp.request(`/api/todos/${todoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(todoId);
    expect(body.completed).toBe(true);
  });

  test('DELETE /api/todos/:id removes a todo', async () => {
    const createRes = await honoApp.request('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'To be deleted' }),
    });
    const created = await createRes.json();

    const res = await honoApp.request(`/api/todos/${created.id}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
  });

  test('GET /api/todos/:id returns 404 for missing todo', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await honoApp.request(`/api/todos/${fakeId}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Todo not found');
  });
});
