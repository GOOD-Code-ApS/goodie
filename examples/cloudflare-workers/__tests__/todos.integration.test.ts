import { execSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Unstable_DevWorker, unstable_dev } from 'wrangler';

const projectRoot = path.resolve(__dirname, '..');

// Tests share a single D1 database without per-test cleanup (no transactional
// rollback like the hono/postgres example). Test assertions account for
// cumulative state — ordering matters.
// Skipped in CI — unstable_dev + workerd is unreliable on GitHub Actions runners.
describe.skipIf(!!process.env.CI)('Cloudflare Workers + D1 Todo API', () => {
  let worker: Unstable_DevWorker;

  beforeAll(async () => {
    // Apply D1 migrations to the local Miniflare database
    execSync(
      'pnpm exec wrangler d1 migrations apply goodie-example-db --local',
      { cwd: projectRoot, stdio: 'pipe' },
    );

    // Start the worker via Miniflare (wrangler dev under the hood)
    worker = await unstable_dev(path.join(projectRoot, 'src/worker.ts'), {
      config: path.join(projectRoot, 'wrangler.toml'),
      experimental: { disableExperimentalWarning: true },
    });
  }, 30_000);

  afterAll(async () => {
    await worker?.stop();
  });

  async function createTodo(title: string) {
    const res = await worker.fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return { status: res.status, body: await res.json() };
  }

  it('POST /api/todos creates a todo and returns 201', async () => {
    const { status, body } = await createTodo('Buy groceries');

    expect(status).toBe(201);
    expect(body.title).toBe('Buy groceries');
    expect(body.completed).toBe(0);
    expect(body.id).toBeDefined();
  });

  it('GET /api/todos lists all todos', async () => {
    await createTodo('First item');
    await createTodo('Second item');

    const res = await worker.fetch('/api/todos');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/todos/:id returns a specific todo', async () => {
    const { body: created } = await createTodo('Specific todo');

    const res = await worker.fetch(`/api/todos/${created.id}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.title).toBe('Specific todo');
  });

  it('DELETE /api/todos/:id removes a todo', async () => {
    const { body: created } = await createTodo('To be deleted');

    const res = await worker.fetch(`/api/todos/${created.id}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);

    // Verify it's gone
    const getRes = await worker.fetch(`/api/todos/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it('GET /api/todos/:id returns 404 for missing todo', async () => {
    const res = await worker.fetch('/api/todos/99999');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Todo not found');
  });
});
