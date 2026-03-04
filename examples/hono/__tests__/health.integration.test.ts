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

describe('Health API', () => {
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

  test('GET /health returns UP with indicators', async ({ resolve }) => {
    const honoApp = app(resolve);

    const res = await honoApp.request('/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('UP');
    expect(body.indicators).toBeDefined();
    expect(body.indicators.uptime.status).toBe('UP');
    expect(body.indicators.uptime.details.uptimeMs).toBeGreaterThan(0);
    expect(body.indicators.database.status).toBe('UP');
  });

  test('GET /health includes database indicator with live connection', async ({
    resolve,
  }) => {
    const honoApp = app(resolve);

    const res = await honoApp.request('/health');

    const body = await res.json();
    expect(body.indicators.database).toEqual({ status: 'UP' });
  });
});
