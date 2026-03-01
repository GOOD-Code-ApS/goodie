import type { ApplicationContext } from '@goodie-ts/core';
import { TestContext } from '@goodie-ts/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { Hono } from 'hono';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRouter, definitions } from '../src/AppContext.generated.js';

describe('Hono + PostgreSQL Todo API', () => {
  let container: StartedPostgreSqlContainer;
  let ctx: ApplicationContext;
  let honoApp: Hono;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();

    const connectionUri = container.getConnectionUri();
    const sql = postgres(connectionUri);
    await sql`
      CREATE TABLE IF NOT EXISTS todos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        completed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `;
    await sql.end();

    ctx = await TestContext.from(definitions)
      .withConfig({ DATABASE_URL: connectionUri })
      .build();

    honoApp = createRouter(ctx);
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
    await container?.stop();
  });

  it('POST /api/todos creates a todo and returns 201', async () => {
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

  it('GET /api/todos lists all todos', async () => {
    const res = await honoApp.request('/api/todos');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].title).toBe('Buy groceries');
  });

  it('GET /api/todos/:id returns a specific todo', async () => {
    const listRes = await honoApp.request('/api/todos');
    const todos = await listRes.json();
    const todoId = todos[0].id;

    const res = await honoApp.request(`/api/todos/${todoId}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(todoId);
    expect(body.title).toBe('Buy groceries');
  });

  it('PATCH /api/todos/:id updates a todo', async () => {
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

  it('DELETE /api/todos/:id removes a todo', async () => {
    // Create a todo to delete
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

  it('GET /api/todos/:id returns 404 for missing todo', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await honoApp.request(`/api/todos/${fakeId}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Todo not found');
  });
});
